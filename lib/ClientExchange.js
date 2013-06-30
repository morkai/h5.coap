'use strict';

var helpers = require('./helpers');
var Message = require('./Message');
var BlockOption = require('./BlockOption');

var MAX_OBSERVE_VALUE_DIFFERENCE = Math.pow(2, 23);
var LATE_OBSERVE_ADDITIONAL_TIMESTAMP = 128 * 1000;

/**
 * @constructor
 * @param {Message} request
 * @param {function(ClientExchange)} timeoutHandler
 * @param {object} options
 * @param {number} options.exchangeTimeout
 * @param {number} options.blockSize
 */
function ClientExchange(request, timeoutHandler, options)
{
  /**
   * @private
   * @type {Message}
   */
  this.request = request;

  /**
   * @private
   * @type {object}
   */
  this.options = options;

  /**
   * @private
   * @type {string}
   */
  this.exchangeKey = request.getExchangeKey();

  /**
   * @private
   * @type {string|null}
   */
  this.transactionKey = null;

  /**
   * @private
   * @type {BlockOption|null}
   */
  this.currentBlock1 = null;

  /**
   * @private
   * @type {boolean}
   */
  this.blockwiseResponsePossible = !request.hasOption(Message.Option.BLOCK2);

  /**
   * @private
   * @type {BlockOption|null}
   */
  this.currentBlock2 = null;

  /**
   * @private
   * @type {Array.<Message>|null}
   */
  this.blocks2 = null;

  /**
   * @private
   * @type {boolean}
   */
  this.observer = request.getCode() === Message.Code.GET
    && request.hasOption(Message.Option.OBSERVE);

  /**
   * @private
   * @type {number}
   */
  this.lastObserveValue = -1;

  /**
   * @private
   * @type {number}
   */
  this.lastResponseTime = 0;

  /**
   * @private
   * @type {number}
   */
  this.lastMaxAge = -1;

  /**
   * @private
   * @type {boolean}
   */
  this.serverInitiative = this.observer;

  /**
   * @private
   * @type {function(ClientExchange)}
   */
  this.timeoutHandler = timeoutHandler;

  /**
   * @private
   * @type {*}
   */
  this.timeoutTimer = null;

  /**
   * @private
   * @type {function}
   */
  this.onTimeout = this.onTimeout.bind(this);

  this.setUpCurrentBlock1();
  this.scheduleTimeout();
}

ClientExchange.prototype.destroy = function()
{
  if (this.timeoutTimer !== null)
  {
    clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }

  this.timeoutHandler = null;
  this.request = null;
  this.options = null;
  this.currentBlock1 = null;
  this.currentBlock2 = null;
  this.blocks2 = null;
};

/**
 * @returns {string}
 */
ClientExchange.prototype.getKey = function()
{
  return this.exchangeKey;
};

/**
 * @returns {string|null}
 */
ClientExchange.prototype.getTransactionKey = function()
{
  return this.transactionKey;
};

/**
 * @param {string} transactionKey
 */
ClientExchange.prototype.setTransactionKey = function(transactionKey)
{
  this.transactionKey = transactionKey;
};

/**
 * @returns {Message}
 */
ClientExchange.prototype.getRequest = function()
{
  return this.request;
};

/**
 * @returns {object}
 */
ClientExchange.prototype.getOptions = function()
{
  return this.options;
};

/**
 * @returns {string}
 */
ClientExchange.prototype.getTokenString = function()
{
  return this.request.getTokenString();
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.isObserver = function()
{
  return this.observer;
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.isSubscribed = function()
{
  return this.lastObserveValue !== -1;
};

/**
 * @param {Message} response
 * @returns {boolean}
 */
ClientExchange.prototype.isLateObserveResponse = function(response)
{
  var v2 = response.getObserve();

  if (v2 === -1)
  {
    return false;
  }

  var v1 = this.lastObserveValue;
  var t2 = response.getTimestamp();
  var t1 = this.lastResponseTime;

  var newer = (v1 < v2 && v2 - v1 < MAX_OBSERVE_VALUE_DIFFERENCE)
    || (v1 > v2 && v1 - v2 > MAX_OBSERVE_VALUE_DIFFERENCE)
    || (t2 > t1 + LATE_OBSERVE_ADDITIONAL_TIMESTAMP);

  return !newer;
};

ClientExchange.prototype.cancel = function()
{
  this.observer = false;
  this.lastObserveValue = -1;
  this.lastResponseTime = 0;
  this.lastMaxAge = -1;

  setImmediate(this.request.emit.bind(this.request, 'cancelled'));
};

/**
 * Determines whether this exchange is a blockwise request.
 *
 * ClientExchange is a blockwise request only if the exchange's request doesn't
 * have a Block1 option and a length of the request's payload is greater than
 * a value of the `blockSize` option.
 *
 * @returns {boolean}
 */
ClientExchange.prototype.isBlockwiseRequest = function()
{
  return this.currentBlock1 !== null;
};

/**
 * Determines whether the specified Block1 option is valid for this exchange.
 *
 * Block1 option is valid only if all of the following conditions are met:
 *
 *   - the exchange is a blockwise request (see {@link isBlockwiseRequest}).
 *   - a number of the specified Block1 is equal to the number of the currently
 *     sent Block1.
 *   - a size of the specified Block1 is less than or equal to the size of the
 *     currently sent Block1.
 *   - if the request with the specified Block1 option, also has the Block2
 *     option, the `m` (more) flag of the Block1 option must be `false` and
 *     the `num` (block number) value of the Block2 option must be `0`.
 *
 * @param {BlockOption} block1
 * @param {BlockOption|null} block2
 * @returns {boolean}
 */
ClientExchange.prototype.isValidBlock1 = function(block1, block2)
{
  if (!this.isBlockwiseRequest())
  {
    return false;
  }

  if (block1.num !== this.currentBlock1.num)
  {
    return false;
  }

  if (block1.szx > this.currentBlock1.szx)
  {
    return false;
  }

  if (block2 !== null)
  {
    if (block1.m)
    {
      return false;
    }

    if (block2.num !== 0)
    {
      return false;
    }
  }

  return true;
};

/**
 * @param {Message} response
 * @param {BlockOption} block1
 * @param {boolean} hasBlock2
 */
ClientExchange.prototype.handleBlock1Response =
  function(response, block1, hasBlock2)
{
  if (block1.size < this.currentBlock1.size)
  {
    this.adjustBlockToSize(this.currentBlock1, block1.size);
  }

  setImmediate(this.request.emit.bind(this.request, 'block sent', response));

  if (!this.hasMoreBlock1() && !hasBlock2)
  {
    this.setResponse(response);
  }
  else if (!block1.m && !hasBlock2)
  {
    setImmediate(this.request.emit.bind(this.request, 'response', response));
  }
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.hasMoreBlock1 = function()
{
  if (this.currentBlock1 === null)
  {
    return false;
  }

  var payloadSize = this.request.getPayloadLength();
  var lastBlockNum = Math.ceil(payloadSize / this.currentBlock1.size) - 1;

  return this.currentBlock1.num < lastBlockNum;
};

/**
 * @param {number} messageId
 * @returns {Message}
 * @throws {TypeError} If this exchange's request is not blockwise.
 */
ClientExchange.prototype.createNextBlock1Request = function(messageId)
{
  this.currentBlock1.num += 1;

  var fullPayload = this.request.getPayload();
  var blockStart = this.currentBlock1.num * this.currentBlock1.size;
  var blockEnd = blockStart + this.currentBlock1.size;
  var blockPayload = fullPayload.slice(blockStart, blockEnd);
  var blockCount = Math.ceil(fullPayload.length / this.currentBlock1.size);

  this.currentBlock1.m = blockCount !== this.currentBlock1.num + 1;

  var nextBlockRequest = new Message();
  nextBlockRequest.setType(Message.Type.CON);
  nextBlockRequest.setCode(this.request.getCode());
  nextBlockRequest.setId(messageId);
  nextBlockRequest.setToken(this.request.getToken());
  nextBlockRequest.setAllOptions(this.request.getAllOptions());
  nextBlockRequest.setBlock1(this.currentBlock1);
  nextBlockRequest.setPayload(blockPayload);
  nextBlockRequest.setRemoteEndpoint(this.request.getRemoteEndpoint());

  return nextBlockRequest;
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.isBlockwiseResponsePossible = function()
{
  return this.blockwiseResponsePossible;
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.isBlockwiseResponse = function()
{
  return this.currentBlock2 !== null;
};

/**
 * @returns {boolean}
 */
ClientExchange.prototype.isServerInitiative = function()
{
  return this.serverInitiative;
};

/**
 * @param {BlockOption} block2
 * @param {number} [observe]
 * @returns {boolean}
 */
ClientExchange.prototype.isValidBlock2 = function(block2, observe)
{
  if (block2.num === 0)
  {
    return true;
  }

  if (this.currentBlock2 === null)
  {
    return block2.num === 0;
  }

  return block2.num === this.currentBlock2.num + 1
    && block2.szx <= this.currentBlock2.szx
    && observe === this.blocks2[0].getObserve();
};

/**
 * @param {Message} blockResponse
 * @param {BlockOption} block2
 * @param {boolean} [serverInitiative]
 */
ClientExchange.prototype.handleBlock2Response =
  function(blockResponse, block2, serverInitiative)
{
  if (typeof serverInitiative === 'boolean')
  {
    this.serverInitiative = serverInitiative;
  }

  this.setCurrentBlock2(block2);

  if (this.blocks2 === null)
  {
    this.blocks2 = [blockResponse];
  }
  else
  {
    this.blocks2.push(blockResponse);
  }

  setImmediate(
    this.request.emit.bind(this, 'block received', blockResponse, block2)
  );

  if (block2.m)
  {
    this.lastMaxAge = -1;
  }
  else
  {
    this.finalizeBlock2Response();
  }
};

/**
 * @param {number} messageId
 * @returns {Message}
 * @throws {TypeError} If the current response to this exchange
 * is not blockwise.
 */
ClientExchange.prototype.createNextBlock2Request = function(messageId)
{
  var nextBlockRequest = new Message();
  nextBlockRequest.setType(Message.Type.CON);
  nextBlockRequest.setCode(Message.Code.GET);
  nextBlockRequest.setId(messageId);
  nextBlockRequest.setToken(this.request.getToken());
  nextBlockRequest.setAllOptions(this.request.getAllOptions());
  nextBlockRequest.setBlock2(
    this.currentBlock2.num + 1, false, this.currentBlock2.szx
  );
  nextBlockRequest.setRemoteEndpoint(this.request.getRemoteEndpoint());

  return nextBlockRequest;
};

/**
 * @param {Message} response
 */
ClientExchange.prototype.setResponse = function(response)
{
  this.blocks2 = null;
  this.currentBlock2 = null;
  this.currentBlock1 = null;
  this.lastObserveValue = response.getObserve();
  this.lastResponseTime = response.getTimestamp();
  this.lastMaxAge = response.getMaxAge();

  setImmediate(this.request.emit.bind(this.request, 'response', response));
};

ClientExchange.prototype.scheduleTimeout = function()
{
  if (this.timeoutTimer !== null)
  {
    clearTimeout(this.timeoutTimer);
  }

  var timeout = this.lastMaxAge === -1
    ? this.options.exchangeTimeout
    : this.lastMaxAge * 1000;

  this.timeoutTimer = setTimeout(this.onTimeout, timeout);
};

/**
 * @private
 */
ClientExchange.prototype.setUpCurrentBlock1 = function()
{
  if (this.request.getPayloadLength() > this.options.blockSize
    && !this.request.hasOption(Message.Option.BLOCK1))
  {
    this.currentBlock1 = new BlockOption(
      Message.Option.BLOCK1,
      -1,
      true,
      helpers.encodeBlockSize(this.options.blockSize)
    );
  }
};

/**
 * @private
 * @param {BlockOption} block2
 */
ClientExchange.prototype.setCurrentBlock2 = function(block2)
{
  this.currentBlock2 = block2;

  if (this.currentBlock2.size > this.options.blockSize)
  {
    this.adjustBlockToSize(this.currentBlock2, this.options.blockSize);
  }

  if (block2.num === 0)
  {
    this.blocks2 = null;
  }
};

/**
 * @private
 */
ClientExchange.prototype.finalizeBlock2Response = function()
{
  var payloadParts = [];
  var totalLength = 0;
  var totalBlocks = this.blocks2.length;

  for (var i = 0; i < totalBlocks; ++i)
  {
    var payloadPart = this.blocks2[i].getPayload();

    payloadParts.push(payloadPart);

    totalLength += payloadPart.length;
  }

  var fullPayload = Buffer.concat(payloadParts, totalLength);
  var lastBlock = this.blocks2[totalBlocks - 1];
  var response = new Message();

  response.setType(lastBlock.getType());
  response.setCode(lastBlock.getCode());
  response.setId(lastBlock.getId());
  response.setToken(lastBlock.getToken());
  response.setAllOptions(lastBlock.getAllOptions());
  response.setPayload(fullPayload);
  response.setRemoteEndpoint(lastBlock.getRemoteEndpoint());

  this.setResponse(response);
};

/**
 * @private
 * @param {BlockOption} blockOption
 * @param {number} newSize
 */
ClientExchange.prototype.adjustBlockToSize = function(block, newSize)
{
  block.num = Math.ceil((block.num + 1) * block.size / newSize) - 1;
  block.szx = helpers.encodeBlockSize(newSize);
  block.size = newSize;
};

/**
 * @private
 */
ClientExchange.prototype.onTimeout = function()
{
  this.timeoutTimer = null;

  setImmediate(this.request.emit.bind(this.request, 'timeout'));

  this.timeoutHandler(this);
};

module.exports = ClientExchange;
