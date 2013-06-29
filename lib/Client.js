'use strict';

var util = require('util');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var TokenManager = require('./TokenManager');
var Message = require('./Message');
var ClientTransaction = require('./ClientTransaction');
var ClientExchange = require('./ClientExchange');

var MAX_MESSAGE_ID = 0xFFFF;
var DEFAULT_MAX_RETRANSMIT = 4;
var DEFAULT_ACK_TIMEOUT = 2000;
var DEFAULT_ACK_RANDOM_FACTOR = 1.5;
var DEFAULT_BLOCK_SIZE = 512;

/**
 * @constructor
 * @extends {events.EventEmitter}
 * @param {object} options
 * @param {dgram.Socket|boolean} [options.socket4]
 * @param {dgram.Socket|boolean} [options.socket6]
 * @param {TokenManager} [options.tokenManager]
 * @param {number} [options.messageId]
 * @param {number} [options.ackTimeout]
 * @param {number} [options.ackRandomFactor]
 * @param {number} [options.maxRetransmit]
 * @param {number} [options.exchangeTimeout]
 * @param {number} [options.duplicateTimeout]
 * @param {number} [options.blockSize]
 */
function Client(options)
{
  /*jshint maxstatements:99*/

  EventEmitter.call(this);

  if (!options)
  {
    options = {};
  }

  /**
   * @private
   * @type {function(ClientExchange)}
   */
  this.onExchangeTimeout = this.onExchangeTimeout.bind(this);

  /**
   * @private
   * @type {function(ClientTransaction)}
   */
  this.onTransactionTimeout = this.onTransactionTimeout.bind(this);

  /**
   * @private
   * @type {function(Buffer, object)}
   */
  this.onMessage = this.onMessage.bind(this);

  /**
   * @private
   * @type {dgram.Socket|null}
   */
  this.socket4 = this.setUpSocket('udp4', options.socket4);

  /**
   * @private
   * @type {dgram.Socket|null}
   */
  this.socket6 = this.setUpSocket('udp6', options.socket6);

  /**
   * @private
   * @type {TokenManager}
   */
  this.tokenManager = options.tokenManager || new TokenManager();

  /**
   * @private
   * @type {number}
   */
  this.messageId = options.messageId >= 0
    ? options.messageId
    : Math.ceil(Math.random() * MAX_MESSAGE_ID);

  /**
   * @private
   * @type {number}
   */
  this.ackTimeout = options.ackTimeout || DEFAULT_ACK_TIMEOUT;

  /**
   * @private
   * @type {number}
   */
  this.ackRandomFactor = options.ackRandomFactor || DEFAULT_ACK_RANDOM_FACTOR;

  /**
   * @private
   * @type {number}
   */
  this.maxRetransmit = options.maxRetransmit || DEFAULT_MAX_RETRANSMIT;

  /**
   * @private
   * @type {number}
   */
  this.exchangeTimeout =
    options.exchangeTimeout || this.calcExchangeTimeout();

  /**
   * @private
   * @type {number}
   */
  this.duplicateTimeout =
    options.duplicateTimeout || Math.round(this.exchangeTimeout / 2);

  /**
   * @private
   * @type {number}
   */
  this.blockSize = options.blockSize || DEFAULT_BLOCK_SIZE;

  /**
   * @private
   * @type {object.<string, ClientTransaction>}
   */
  this.transactions = {};

  /**
   * @private
   * @type {object.<string, ClientExchange>}
   */
  this.exchanges = {};

  /**
   * @private
   * @type {object.<string, ClientExchange>}
   */
  this.observers = {};

  /**
   * @private
   * @type {object.<string, string>}
   */
  this.duplicates = {};

  /**
   * @private
   * @type {object.<string, Message>}
   */
  this.replies = {};

  /**
   * @private
   * @type {Array}
   */
  this.timers = {};
}

util.inherits(Client, EventEmitter);

Client.prototype.destroy = function()
{
  /*jshint maxstatements:22*/

  this.removeAllListeners();

  if (this.socket4 !== null)
  {
    this.socket4.removeAllListeners();
    this.socket4.close();
    this.socket4 = null;
  }

  if (this.socket6 !== null)
  {
    this.socket6.removeAllListeners();
    this.socket6.close();
    this.socket6 = null;
  }

  this.tokenManager.destroy();
  this.tokenManager = null;

  var client = this;

  Object.keys(this.transactions).forEach(function(transactionKey)
  {
    client.transactions[transactionKey].destroy();
  });

  Object.keys(this.exchanges).forEach(function(exchangeKey)
  {
    client.exchanges[exchangeKey].destroy();
  });

  Object.keys(this.timers).forEach(function(timerKey)
  {
    clearTimeout(client.timers[timerKey]);
  });

  this.transactions = null;
  this.exchanges = null;
  this.observers = null;
  this.timers = null;
  this.duplicates = null;
  this.replies = null;
};

/**
 * @param {Message} request
 * @param {object} [options]
 * @param {number} [options.blockSize]
 * @param {number} [options.exchangeTimeout]
 * @param {number} [options.transactionTimeout]
 * @param {number} [options.maxRetransmit]
 * @return {Message}
 * @throws {Error} If the specified message is not a request.
 */
Client.prototype.request = function(request, options)
{
  if (!request.isRequest())
  {
    throw new Error("The specified message must be a request.");
  }

  if (typeof options === 'undefined')
  {
    options = {};
  }

  request.setId(this.getNextMessageId());
  request.setToken(this.tokenManager.acquire());

  options.includeBlock2 = typeof options.includeBlock2 === 'boolean'
    ? options.includeBlock2
    : typeof options.blockSize === 'number';
  options.blockSize = options.blockSize || this.blockSize;
  options.exchangeTimeout = options.exchangeTimeout || this.exchangeTimeout;

  var exchange = this.setUpExchange(request, options);

  if (exchange.isBlockwiseRequest())
  {
    this.sendNextBlock(exchange, true);
  }
  else
  {
    if (options.includeBlock2 && request.getCode() === Message.Code.GET)
    {
      request.setBlock2(0, false, options.blockSize);
    }

    if (request.isConfirmable())
    {
      this.setUpTransaction(exchange, request);
    }

    this.sendMessage(request);
  }

  return request;
};

/**
 * @param {string} uri
 * @param {object} [options]
 * @returns {Message}
 */
Client.prototype.get = function(uri, options)
{
  return this.request(
    this.createMessage(Message.Code.GET, uri, null, options),
    options
  );
};

/**
 * @param {string} uri
 * @param {object} [options]
 * @returns {Message}
 */
Client.prototype.observe = function(uri, options)
{
  var message = this.createMessage(Message.Code.GET, uri, null, options);

  message.setObserve(true);

  return this.request(message, options);
};

/**
 * @param {string} uri
 * @param {Buffer|string} payload
 * @param {object} [options]
 * @returns {Message}
 */
Client.prototype.post = function(uri, payload, options)
{
  return this.request(
    this.createMessage(Message.Code.POST, uri, payload, options),
    options
  );
};

/**
 * @param {string} uri
 * @param {Buffer|string} payload
 * @param {object} [options]
 * @returns {Message}
 */
Client.prototype.put = function(uri, payload, options)
{
  return this.request(
    this.createMessage(Message.Code.PUT, uri, payload, options),
    options
  );
};

/**
 * @param {string} uri
 * @param {object} [options]
 * @returns {Message}
 */
Client.prototype.del = function(uri, options)
{
  return this.request(
    this.createMessage(Message.Code.DELETE, uri, null, options),
    options
  );
};

/**
 * @param {Message} message
 */
Client.prototype.cancel = function(message)
{
  var exchangeKey = message.getExchangeKey();
  var exchange = this.exchanges[exchangeKey];

  if (typeof exchange === 'undefined')
  {
    return;
  }

  this.finishTransaction(exchange.getTransactionKey());

  if (exchange.isSubscribed())
  {
    this.removeObserver(
      message.getRemoteEndpoint().toString(),
      message.getUriPath()
    );
  }
  else
  {
    this.finishExchange(exchange);
  }
};

/**
 * @private
 * @param {Message.Code} code
 * @param {string} uri
 * @param {Buffer|string|null} payload
 * @param {object|undefined} options
 * @returns {*}
 */
Client.prototype.createMessage = function(code, uri, payload, options)
{
  if (typeof options === 'object')
  {
    options.code = code;
    options.uri = uri;

    if (payload !== null)
    {
      options.payload = payload;
    }

    return Message.fromObject(options);
  }
  else
  {
    var message = new Message();

    message.setCode(code);
    message.setUri(uri);

    if (payload !== null)
    {
      message.setPayload(payload);
    }

    return message;
  }
};

/**
 * @private
 * @param {string} type
 * @param {Socket|boolean} option
 * @returns {Socket|null}
 */
Client.prototype.setUpSocket = function(type, option)
{
  var socket = null;

  if (option !== null && typeof option === 'object')
  {
    socket = option;
  }
  else if (option !== false)
  {
    socket = dgram.createSocket(type);
  }

  if (socket !== null)
  {
    socket.on('message', this.onMessage);
  }

  return socket;
};

/**
 * @private
 * @returns {number}
 */
Client.prototype.getNextMessageId = function()
{
  if (this.messageId === MAX_MESSAGE_ID)
  {
    this.messageId = 0;
  }

  return ++this.messageId;
};

/**
 * @private
 * @param {Message} request
 * @param {object} options
 * @returns {ClientExchange}
 */
Client.prototype.setUpExchange = function(request, options)
{
  var exchange = new ClientExchange(request, this.onExchangeTimeout, options);

  this.exchanges[exchange.getKey()] = exchange;

  return exchange;
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} request
 * @returns {ClientTransaction}
 */
Client.prototype.setUpTransaction = function(exchange, request)
{
  var options = exchange.getOptions();

  if (typeof options.maxRetransmit !== 'number')
  {
    options.maxRetransmit = this.maxRetransmit;
  }

  if (typeof options.transactionTimeout !== 'number')
  {
    options.transactionTimeout = this.genTransactionTimeout();
  }

  var transaction = new ClientTransaction(
    request,
    exchange.getKey(),
    this.onTransactionTimeout,
    options
  );
  var transactionKey = transaction.getKey();

  exchange.setTransactionKey(transactionKey);

  this.transactions[transactionKey] = transaction;

  return transaction;
};

/**
 * Accepts or rejects a transaction identified by the specified transaction key.
 *
 * @private
 * @param {string} transactionKey
 * @param {boolean} [accept]
 * @param {Message} [response]
 */
Client.prototype.finishTransaction = function(transactionKey, accept, response)
{
  var transaction = this.transactions[transactionKey];

  if (typeof transaction === 'undefined')
  {
    return;
  }

  delete this.transactions[transactionKey];

  if (accept === true)
  {
    transaction.accept(response);
  }
  else if (accept === false)
  {
    transaction.reject(response);
  }

  transaction.destroy();
};

/**
 * Cleans up after completed exchanges.
 *
 * @private
 * @param {ClientExchange} exchange
 * @param {boolean} [cancel] Whether to cancel the observer exchange.
 * Defaults to `true`.
 */
Client.prototype.finishExchange = function(exchange, cancel)
{
  if (exchange.isObserver() && cancel !== false)
  {
    exchange.cancel();
  }

  delete this.exchanges[exchange.getKey()];

  this.tokenManager.release(exchange.getTokenString());

  exchange.destroy();
};

/**
 * @private
 * @returns {number}
 */
Client.prototype.calcExchangeTimeout = function()
{
  return this.ackTimeout
    * Math.pow(2, this.maxRetransmit + 1)
    * this.ackRandomFactor;
};

/**
 * @private
 * @returns {number}
 */
Client.prototype.genTransactionTimeout = function()
{
  return Math.random()
    * ((this.ackTimeout * this.ackRandomFactor) - this.ackTimeout)
    +  this.ackTimeout;
};

/**
 * @private
 * @param {ClientTransaction} transaction
 * @param {number} retries
 */
Client.prototype.onTransactionTimeout = function(transaction, retries)
{
  if (transaction.isLimitReached())
  {
    this.emit('transaction timeout', transaction.getRequest());

    this.finishTransaction(transaction.getKey());
    this.finishExchange(this.exchanges[transaction.getExchangeKey()]);
  }
  else
  {
    this.sendMessage(transaction.getRequest(), retries);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 */
Client.prototype.onExchangeTimeout = function(exchange)
{
  var request = exchange.getRequest();
  var options = exchange.getOptions();
  var wasSubscribed = exchange.isSubscribed();

  this.emit('exchange timeout', request);

  this.finishTransaction(exchange.getTransactionKey());

  if (wasSubscribed)
  {
    this.removeObserver(
      request.getRemoteEndpoint().toString(),
      request.getUriPath(),
      true,
      false
    );

    this.request(request, options);
  }
  else
  {
    this.finishExchange(exchange);
  }
};

/**
 * @private
 * @param {Buffer} messageBuffer
 * @param {{address: string, port: number}} rinfo
 */
Client.prototype.onMessage = function(messageBuffer, rinfo)
{
  var response;

  try
  {
    response = Message.fromBuffer(messageBuffer);
  }
  catch (err)
  {
    this.emit('error', err);

    return;
  }

  response.setRemoteEndpoint(rinfo.address, rinfo.port);

  this.emit('message received', response);

  var messageKey = response.getKey();

  if (this.isDuplicateMessage(messageKey))
  {
    this.handleDuplicateMessage(messageKey);

    return;
  }

  var transactionKey = response.getTransactionKey();

  this.setUpDuplicateMessage(messageKey, transactionKey);

  if (response.isRequest())
  {
    this.handleRequestMessage(response);

    return;
  }

  this.handleResponse(response, transactionKey);
};

/**
 * @private
 * @param {Message} request
 */
Client.prototype.handleRequestMessage = function(request)
{
  if (!request.isConfirmable())
  {
    return;
  }

  this.sendRstReply(request);
};

/**
 * @private
 * @param {Message} response
 * @param {string} transactionKey
 */
Client.prototype.handleResponse = function(response, transactionKey)
{
  if (response.isReset())
  {
    this.handleRstMessage(response, transactionKey);

    return;
  }

  if (response.isEmptyAcknowledgement())
  {
    this.handleEmptyAckMessage(response, transactionKey);

    return;
  }

  var exchange = this.exchanges[response.getExchangeKey()];

  if (!exchange)
  {
    if (response.isConfirmable())
    {
      this.sendRstReply(response);
    }

    return;
  }

  this.handleExchangeResponse(exchange, response, transactionKey);
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {string} transactionKey
 */
Client.prototype.handleExchangeResponse =
  function(exchange, response, transactionKey)
{
  this.handleTransaction(exchange, response, transactionKey);

  if (exchange.isLateObserveResponse(response))
  {
    if (response.isConfirmable())
    {
      this.sendAckReply(response);
    }

    return;
  }

  this.handleObserver(exchange, response);

  var block1 = response.getBlock1();

  if (block1 !== null)
  {
    this.handleBlock1Response(exchange, response, block1);

    return;
  }

  var block2 = response.getBlock2();

  if (block2 !== null && exchange.isBlockwiseResponsePossible())
  {
    var serverInitiative =
      exchange.isObserver() || exchange.isBlockwiseRequest();

    this.handleBlock2Response(exchange, response, block2, serverInitiative);

    return;
  }

  this.handleSimpleExchangeResponse(exchange, response);
};

/**
 * @private
 * @param {string} transactionKey
 * @returns {boolean}
 */
Client.prototype.isDuplicateMessage = function(messageKey)
{
  return typeof this.duplicates[messageKey] !== 'undefined';
};

/**
 * @private
 * @param {string} messageKey
 */
Client.prototype.handleDuplicateMessage = function(messageKey)
{
  var transactionKey = this.duplicates[messageKey];
  var reply = this.replies[transactionKey];

  if (reply)
  {
    this.sendMessage(reply);
  }
};

/**
 * @private
 * @param {string} messageKey
 * @param {string} transactionKey
 */
Client.prototype.setUpDuplicateMessage = function(messageKey, transactionKey)
{
  this.duplicates[messageKey] = transactionKey;

  var timerKey = 'DUP:' + messageKey;
  var client = this;

  this.timers[timerKey] = setTimeout(
    function()
    {
      delete client.duplicates[messageKey];
      delete client.replies[transactionKey];
      delete client.timers[timerKey];
    },
    this.duplicateTimeout
  );
};

/**
 * @private
 * @param {Message} rstMessage
 * @param {string} transactionKey
 */
Client.prototype.handleRstMessage = function(rstMessage, transactionKey)
{
  var transaction = this.transactions[transactionKey];

  if (typeof transaction === 'undefined')
  {
    return;
  }

  var exchangeKey = transaction.getExchangeKey();

  this.finishTransaction(transactionKey, false, rstMessage);
  this.finishExchange(this.exchanges[exchangeKey]);
};

/**
 * @private
 * @param {Message} ackMessage
 * @param {string} transactionKey
 */
Client.prototype.handleEmptyAckMessage = function(ackMessage, transactionKey)
{
  var transaction = this.transactions[transactionKey];

  if (typeof transaction !== 'undefined')
  {
    this.finishTransaction(transactionKey, true, ackMessage);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {string} transactionKey
 */
Client.prototype.handleTransaction =
  function(exchange, response, transactionKey)
{
  if (typeof this.transactions[transactionKey] !== 'undefined')
  {
    this.finishTransaction(transactionKey, true, response);
  }
  else
  {
    transactionKey = exchange.getTransactionKey();

    if (typeof this.transactions[transactionKey] !== 'undefined')
    {
      this.finishTransaction(transactionKey, true, response);
    }
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 */
Client.prototype.handleObserver = function(exchange, response)
{
  var request = exchange.getRequest();

  if (request.getCode() !== Message.Code.GET)
  {
    return;
  }

  var code = response.getCode();

  if (code === Message.Code.CONTENT || code === Message.Code.VALID)
  {
    this.handleObserverSuccess(exchange, request, response);
  }
  else
  {
    this.handleObserverError(exchange, request);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} request
 * @param {Message} response
 */
Client.prototype.handleObserverSuccess = function(exchange, request, response)
{
  if (exchange.isSubscribed())
  {
    return;
  }

  if (exchange.isObserver() && response.getObserve() !== -1)
  {
    this.updateObserver(exchange, request);
  }
  else
  {
    this.removeObserver(
      request.getRemoteEndpoint().toString(),
      request.getUriPath()
    );
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} request
 */
Client.prototype.handleObserverError = function(exchange, request)
{
  if (exchange.isObserver())
  {
    if (exchange.isSubscribed())
    {
      var uriPath = request.getUriPath();

      this.removeObserver(
        request.getRemoteEndpoint().toString(), uriPath, false
      );
    }

    exchange.cancel();
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} request
 */
Client.prototype.updateObserver = function(exchange, request)
{
  var remoteEndpoint = request.getRemoteEndpoint().toString();

  if (typeof this.observers[remoteEndpoint] === 'undefined')
  {
    this.observers[remoteEndpoint] = {$count: 0};
  }

  var endpointObservers = this.observers[remoteEndpoint];
  var uriPath = request.getUriPath();

  if (typeof endpointObservers[uriPath] === 'undefined')
  {
    endpointObservers.$count += 1;
  }
  else
  {
    var oldExchange = endpointObservers[uriPath];

    if (oldExchange === exchange)
    {
      return;
    }

    this.finishExchange(oldExchange);
  }

  endpointObservers[uriPath] = exchange;
};

/**
 * @private
 * @param {string} remoteEndpoint
 * @param {string} uriPath
 * @param {boolean} [finish] Whether to finish the exchange for the specified
 * remote endpoint and Uri-Path. Defaults to `true`.
 * @param {boolean} [cancel] Whether to cancel the exchange while finishing it.
 * Defaults to `true`.
 */
Client.prototype.removeObserver =
  function(remoteEndpoint, uriPath, finish, cancel)
{
  var endpointObservers = this.observers[remoteEndpoint];

  if (typeof endpointObservers === 'undefined')
  {
    return;
  }

  var exchange = endpointObservers[uriPath];

  if (typeof exchange === 'undefined')
  {
    return;
  }

  if (finish !== false)
  {
    this.finishExchange(exchange, cancel);
  }

  delete endpointObservers[uriPath];

  endpointObservers.$count -= 1;

  if (endpointObservers.$count === 0)
  {
    delete this.observers[remoteEndpoint];
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block1
 */
Client.prototype.handleBlock1Response = function(exchange, response, block1)
{
  var block2 = response.getBlock2();

  if (!exchange.isValidBlock1(block1, block2))
  {
    if (response.isConfirmable())
    {
      this.sendRstReply(response);
    }

    return;
  }

  exchange.handleBlock1Response(response, block1, block2 !== null);

  if (exchange.hasMoreBlock1())
  {
    this.sendNextBlock(exchange, false);
  }
  else if (block2 !== null)
  {
    this.handleBlock2Response(exchange, response, block2, true);
  }
  else
  {
    this.finishExchange(exchange);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block2
 * @param {boolean} [serverInitiative]
 */
Client.prototype.handleBlock2Response =
  function(exchange, response, block2, serverInitiative)
{
  if (block2.num > 0 && exchange.isBlockwiseResponse())
  {
    this.handleExistingBlock2Response(exchange, response, block2);
  }
  else
  {
    this.handleNewBlock2Response(exchange, response, block2, serverInitiative);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block2
 * @param {boolean} serverInitiative
 */
Client.prototype.handleNewBlock2Response =
  function(exchange, response, block2, serverInitiative)
{
  if (exchange.isValidBlock2(block2))
  {
    this.handleNewValidBlock2Response(
      exchange, response, block2, serverInitiative
    );
  }
  else
  {
    this.handleInvalidBlock2Response(
      exchange, response, block2, response.getObserve()
    );
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block2
 * @param {boolean} serverInitiative
 */
Client.prototype.handleNewValidBlock2Response =
  function(exchange, response, block2, serverInitiative)
{
  if (response.isConfirmable())
  {
    this.sendAckReply(response);
  }

  exchange.handleBlock2Response(response, block2, serverInitiative);

  if (exchange.isServerInitiative())
  {
    exchange.scheduleTimeout();
  }
  else if (block2.m)
  {
    this.requestNextBlock(exchange);
  }
  else
  {
    this.finishExchange(exchange);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block2
 */
Client.prototype.handleExistingBlock2Response =
  function(exchange, response, block2)
{
  var observe = response.getObserve();

  if (!exchange.isValidBlock2(block2, observe))
  {
    this.handleInvalidBlock2Response(
      exchange, response, block2, observe
    );

    return;
  }

  if (response.isConfirmable())
  {
    this.sendAckReply(response);
  }

  exchange.handleBlock2Response(response, block2, observe);

  if (block2.m)
  {
    if (exchange.isServerInitiative())
    {
      exchange.scheduleTimeout();
    }
    else
    {
      this.requestNextBlock(exchange);
    }
  }
  else
  {
    if (exchange.isSubscribed())
    {
      exchange.scheduleTimeout();
    }
    else
    {
      this.finishExchange(exchange);
    }
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 * @param {BlockOption} block2
 * @param {number} observe
 */
Client.prototype.handleInvalidBlock2Response =
  function(exchange, response, block2, observe)
{
  if (response.isConfirmable())
  {
    if (observe === -1)
    {
      this.sendRstReply(response);
    }
    else
    {
      this.sendAckReply(response);
    }
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {Message} response
 */
Client.prototype.handleSimpleExchangeResponse = function(exchange, response)
{
  if (response.isConfirmable())
  {
    this.sendAckReply(response);
  }

  exchange.setResponse(response);

  if (exchange.isSubscribed())
  {
    exchange.scheduleTimeout();
  }
  else
  {
    this.finishExchange(exchange);
  }
};

/**
 * @private
 * @param {ClientExchange} exchange
 */
Client.prototype.requestNextBlock = function(exchange)
{
  var nextBlock2Request = exchange.createNextBlock2Request(
    this.getNextMessageId()
  );

  this.bindTimeoutToParentRequest(nextBlock2Request, exchange.getRequest());

  this.setUpTransaction(exchange, nextBlock2Request);

  this.sendMessage(nextBlock2Request);
};

/**
 * @private
 * @param {ClientExchange} exchange
 * @param {boolean} first
 */
Client.prototype.sendNextBlock = function(exchange, first)
{
  var nextBlock1Request =
    exchange.createNextBlock1Request(this.getNextMessageId());

  this.bindTimeoutToParentRequest(nextBlock1Request, exchange.getRequest());

  var transaction = this.setUpTransaction(exchange, nextBlock1Request);

  if (first)
  {
    transaction.setParentRequest(exchange.getRequest());
  }

  this.sendMessage(nextBlock1Request);
};

/**
 * @private
 * @param {Message} childRequest
 * @param {Message} parentRequest
 */
Client.prototype.bindTimeoutToParentRequest =
  function(childRequest, parentRequest)
{
  childRequest.once(
    'timeout', parentRequest.emit.bind(parentRequest, 'timeout')
  );
};

/**
 * @private
 * @param {Message} message
 * @param {number} [retries]
 */
Client.prototype.sendMessage = function(message, retries)
{
  var messageBuffer = message.toBuffer();
  var remoteEndpoint = message.getRemoteEndpoint();
  var socket = remoteEndpoint.isIPv6() ? this.socket6 : this.socket4;

  if (socket === null)
  {
    setImmediate(
      message.emit.bind(
        message,
        'error',
        new Error("Cannot send the message. Socket type not supported.")
      )
    );

    return;
  }

  try
  {
    socket.send(
      messageBuffer,
      0,
      messageBuffer.length,
      remoteEndpoint.getPort(),
      remoteEndpoint.getAddress()
    );

    message.setTimestamp();

    this.emit('message sent', message, retries || 0);
  }
  catch (err)
  {
    setImmediate(message.emit.bind(message, 'error', err));
  }
};

/**
 * @private
 * @param {Message} message
 */
Client.prototype.sendRstReply = function(message)
{
  var rstReply = message.createReply(Message.Type.RST, Message.Code.EMPTY);

  this.replies[message.getTransactionKey()] = rstReply;

  this.sendMessage(rstReply);
};

/**
 * @private
 * @param {Message} message
 */
Client.prototype.sendAckReply = function(message)
{
  var ackReply = message.createReply(Message.Type.ACK, Message.Code.EMPTY);

  this.replies[message.getTransactionKey()] = ackReply;

  this.sendMessage(ackReply);
};

module.exports = Client;
