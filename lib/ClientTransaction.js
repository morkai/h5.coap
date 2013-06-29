'use strict';

/**
 * @constructor
 * @param {Message} request
 * @param {string} exchangeKey
 * @param {function(ClientTransaction, number)} timeoutHandler
 * @param {object} options
 * @param {number} options.transactionTimeout
 * @param {number} options.maxRetransmit
 */
function ClientTransaction(request, exchangeKey, timeoutHandler, options)
{
  /**
   * @private
   * @type {string}
   */
  this.transactionKey = request.getTransactionKey();

  /**
   * @private
   * @type {string}
   */
  this.exchangeKey = exchangeKey;

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
   * @type {Message|null}
   */
  this.parentRequest = null;

  /**
   * @private
   * @type {number}
   */
  this.currentTimeout = options.transactionTimeout;

  /**
   * @private
   * @type {function(ClientTransaction, number)}
   */
  this.timeoutHandler = timeoutHandler;

  /**
   * @private
   * @type {*}
   */
  this.timeoutTimer = null;

  /**
   * @private
   * @type {number}
   */
  this.timeoutCounter = 0;

  /**
   * @private
   * @type {function}
   */
  this.onTimeout = this.onTimeout.bind(this);

  this.scheduleTimeoutTimer();
}

/**
 * @returns {string}
 */
ClientTransaction.prototype.getKey = function()
{
  return this.transactionKey;
};

/**
 * @returns {string}
 */
ClientTransaction.prototype.getExchangeKey = function()
{
  return this.exchangeKey;
};

/**
 * @returns {Message}
 */
ClientTransaction.prototype.getRequest = function()
{
  return this.request;
};

/**
 * @param {Message} parentRequest
 */
ClientTransaction.prototype.setParentRequest = function(parentRequest)
{
  this.parentRequest = parentRequest;
};

/**
 * @param {Message} ackMessage
 */
ClientTransaction.prototype.accept = function(ackMessage)
{
  this.delayEmit('acknowledged', ackMessage);
};

/**
 * @param {Message} rstMessage
 */
ClientTransaction.prototype.reject = function(rstMessage)
{
  this.delayEmit('reset', rstMessage);
};

ClientTransaction.prototype.destroy = function()
{
  if (this.timeoutTimer !== null)
  {
    clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }

  this.timeoutHandler = null;
  this.request = null;
  this.parentRequest = null;
  this.options = null;
};

/**
 * @returns {boolean}
 */
ClientTransaction.prototype.isLimitReached = function()
{
  return this.timeoutCounter >= (this.options.maxRetransmit + 1);
};

/**
 * @private
 */
ClientTransaction.prototype.scheduleTimeoutTimer = function()
{
  this.timeoutTimer = setTimeout(this.onTimeout, this.currentTimeout);
};

/**
 * @private
 */
ClientTransaction.prototype.onTimeout = function()
{
  this.timeoutTimer = null;

  this.currentTimeout *= 2;
  this.timeoutCounter += 1;

  if (this.isLimitReached())
  {
    setImmediate(this.request.emit.bind(this.request, 'timeout'));
  }
  else
  {
    this.scheduleTimeoutTimer();
  }

  this.timeoutHandler(this, this.timeoutCounter);
};

/**
 * @private
 * @param {string} event
 * @param {Message} response
 */
ClientTransaction.prototype.delayEmit = function(event, response)
{
  setImmediate(
    function(event, response, request, parentRequest)
    {
      request.emit(event, response);

      if (parentRequest !== null)
      {
        parentRequest.emit(event, response);
      }
    },
    event,
    response,
    this.request,
    this.parentRequest
  );
};

module.exports = ClientTransaction;
