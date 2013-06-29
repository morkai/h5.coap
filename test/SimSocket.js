'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Socket = require('dgram').Socket;

/**
 * @constructor
 * @extends {dgram.Socket}
 * @param {function(new:Message)} Message
 * @param {function(Message, object, string)}
 */
function SimSocket(Message, assertMessage)
{
  EventEmitter.call(this);

  /**
   * @private
   * @type {{address: string, port: number}}
   */
  this.rinfo = {address: '127.0.0.1', port: 5683};

  /**
   * @private
   * @type {Array.<object>}
   */
  this.expectedRequests = [];

  /**
   * @private
   * @type {number}
   */
  this.requestCount = 0;

  /**
   * @private
   * @type {Array.<Error>}
   */
  this.errors = [];

  /**
   * @private
   * @type {function(new:Message)}
   */
  this.Message = Message;

  /**
   * @private
   * @type {function(Message, object, string)}
   */
  this.assertMessage = assertMessage;

  /**
   * @private
   * @type {number}
   */
  this.startTime = Date.now();
}

util.inherits(SimSocket, EventEmitter);

Object.keys(Socket.prototype).forEach(function(methodName)
{
  SimSocket.prototype[methodName] = function() {};
});

SimSocket.prototype.send = function(messageBuffer)
{
  var actualRequest = this.Message.fromBuffer(messageBuffer);
  var expectedRequestData = this.expectedRequests.shift();

  ++this.requestCount;

  if (!expectedRequestData)
  {
    this.errors.push(new Error(
      "Unexpected message #" + this.requestCount + " from the client:\n"
        + actualRequest.toPrettyString()
    ));

    return;
  }

  var expectedRequest = expectedRequestData.request;
  var expectedDelay = expectedRequestData.delay;

  try
  {
    this.assertMessage(
      actualRequest, expectedRequest, "Unexpected request sent."
    );
  }
  catch (err)
  {
    this.errors.push(err);

    return;
  }

  if (!expectedDelay)
  {
    return;
  }

  var actualDelay = Date.now() - this.startTime;

  if (actualDelay !== expectedDelay)
  {
    var message = this.Message.fromObject(expectedRequest);

    this.errors.push(new Error(
      "Expected message #" + this.requestCount + " to be sent after "
        + expectedDelay + " ms, but it was sent after " + actualDelay + " ms:\n"
        + message.toPrettyString()
    ));
  }
};

/**
 * @param {number} [delay]
 * @param {object} request
 */
SimSocket.prototype.expectRequest = function(delay, request)
{
  if (!request)
  {
    request = delay;
    delay = 0;
  }

  this.expectedRequests.push({request: request, delay: delay});
};

/**
 * @param {number} delay
 * @param {object} response
 */
SimSocket.prototype.scheduleResponse = function(delay, response)
{
  var messageBuffer = this.Message.fromObject(response).toBuffer();

  setTimeout(
    this.emit.bind(this, 'message', messageBuffer, this.rinfo),
    delay
  );
};

/**
 * @private
 * @throws {Error}
 */
SimSocket.prototype.assert = function()
{
  if (this.errors.length > 0)
  {
    throw this.errors[0];
  }

  if (this.expectedRequests.length > 0)
  {
    var expectedRequest = this.expectedRequests[0].request;

    throw new Error(
      "Expected request #" + (this.requestCount + 1) + " was not sent:\n"
        + this.Message.fromObject(expectedRequest).toPrettyString()
    );
  }
};

module.exports = SimSocket;
