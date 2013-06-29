/*global it:true*/

'use strict';

var LIB_FOR_TESTS_DIR = process.env.LIB_FOR_TESTS_DIR || __dirname + '/../lib';

var util = require('util');
var path = require('path');
var AssertionError = require('assert').AssertionError;
var deepEqual = require('deep-equal');
var sinon = require('sinon');
var SimSocket = require('./SimSocket');
var Client = require(LIB_FOR_TESTS_DIR + '/Client');
var Message = require(LIB_FOR_TESTS_DIR + '/Message');
var TokenManager = require(LIB_FOR_TESTS_DIR + '/TokenManager');

exports.LIB_DIR = LIB_FOR_TESTS_DIR;

exports.test = function(filename, test)
{
  var testName = path.basename(filename, '.js');

  if (testName.charAt(0) === 'x')
  {
    return;
  }

  it(testName, function(done)
  {
    var ctx = {};

    ctx.startTime = Date.now();
    ctx.clock = sinon.useFakeTimers(ctx.startTime);
    ctx.tokenManager = new TokenManager();
    ctx.socket = new SimSocket(Message, assertMessage);

    var clientOptions = {
      socket4: ctx.socket,
      socket6: false,
      ackRandomFactor: 1,
      messageId: 0,
      tokenManager: ctx.tokenManager
    };

    ctx.client = new Client(clientOptions);

    ctx.reinitializeClient = function()
    {
      ctx.client.destroy();
      ctx.client = new Client(clientOptions);
    };

    /*
    ctx.client.on('message sent', function(m)
    {
      console.log('TX:');
      console.log(m.toPrettyString());
    });

    ctx.client.on('message received', function(m)
    {
      console.log('RX:');
      console.log(m.toPrettyString());
    });
    */

    var assert;

    try
    {
      assert = test.call(null, ctx);
    }
    catch (err)
    {
      ctx.clock.restore();

      done(err);

      return;
    }

    setImmediate(function()
    {
      try
      {
        assert();

        assertEmptyObject('transaction count', ctx.client.transactions);
        assertEmptyObject('exchange count', ctx.client.exchanges);
        assertEmptyObject('observer count', ctx.client.observers);
        assertEmptyObject('timer count', ctx.client.timers);
        assertEmptyObject('duplicate count', ctx.client.duplicates);
        assertEmptyObject('reply count', ctx.client.replies);

        ctx.clock.restore();

        done();
      }
      catch (err)
      {
        ctx.clock.restore();

        done(err);
      }
    });
  });
};

var originalSpyReset = sinon.spy.reset;
var originalSpyInvoke = sinon.spy.invoke;

sinon.spy.reset = function()
{
  originalSpyReset.apply(this, arguments);

  this.callTimes = [];
};

sinon.spy.invoke = function()
{
  var returnValue = originalSpyInvoke.apply(this, arguments);

  this.callTimes.push(Date.now());

  return returnValue;
};

sinon.match.coapMessage = function(expectedProperties)
{
  return sinon.match(function coapMessage(actualMessage)
  {
    return matchMessage(actualMessage, expectedProperties).length === 0;
  });
};

sinon.assert.coapMessage = assertMessage;

sinon.assert.calledAt = function(spy, call, expectedTime)
{
  if (arguments.length === 2)
  {
    expectedTime = call;
    call = null;
  }

  var actualTime = -1;
  var passed = false;

  if (call === null)
  {
    for (var i = 0; i < spy.callTimes.length; ++i)
    {
      actualTime = spy.callTimes[i];

      if (actualTime === expectedTime)
      {
        passed = true;

        break;
      }
    }
  }
  else
  {
    actualTime = spy.callTimes[call - 1];
    passed = actualTime === expectedTime;
  }

  if (!passed)
  {
    throw new AssertionError({
      message: util.format(
        "Expected %s to be called at %d ms, but was called at %d ms",
        spy,
        expectedTime,
        actualTime
      ),
      actual: actualTime,
      expected: expectedTime
    });
  }
};

/**
 * @private
 * @param {Message} actualRequest
 * @param {object} expectedProperties
 * @param {Message} [expectedRequest]
 * @returns {Array}
 */
function matchMessage(actualRequest, expectedProperties, expectedRequest)
{
  var invalidProperties = [];

  if (!expectedRequest)
  {
    expectedRequest = Message.fromObject(expectedProperties);
  }

  Object.keys(expectedProperties).forEach(function(propertyName)
  {
    var getter = 'get'
      + propertyName.charAt(0).toUpperCase()
      + propertyName.substr(1);

    if (typeof actualRequest[getter] !== 'function')
    {
      return;
    }

    var actualValue = actualRequest[getter]();

    if (Buffer.isBuffer(actualValue))
    {
      actualValue = Array.prototype.slice.call(actualValue);
    }

    var expectedValue = expectedRequest[getter]();

    if (Buffer.isBuffer(expectedValue))
    {
      expectedValue = Array.prototype.slice.call(expectedValue);
    }

    if (!deepEqual(actualValue, expectedValue))
    {
      invalidProperties.push(propertyName);
    }
  });

  return invalidProperties;
}

/**
 * @private
 * @param {*} actualRequest
 * @param {object} expectedProperties
 * @param {string} [message]
 * @throws {AssertionError}
 */
function assertMessage(actualRequest, expectedProperties, message)
{
  var expectedRequest = Message.fromObject(expectedProperties);

  if (!(actualRequest instanceof Message))
  {
    throw new AssertionError({
      message: util.format(
        "%sExpected the value to be an instance of coap.Message:\n%s",
        message ? message + ' ' : '',
        expectedRequest.toPrettyString()
      ),
      actual: actualRequest,
      expected: expectedRequest
    });
  }

  var invalidProperties =
    matchMessage(actualRequest, expectedProperties, expectedRequest);

  if (invalidProperties.length > 0)
  {
    throw new AssertionError({
      message: util.format(
        "%sInvalid message properties: %s.\n"
          + "Actual message:\n%s\n"
          + "Expected message:\n%s",
        message ? message + ' ' : '',
        invalidProperties.join(', '),
        actualRequest.toPrettyString(),
        expectedRequest.toPrettyString()
      ),
      actual: actualRequest,
      expected: expectedRequest
    });
  }
}

/**
 * @private
 * @param {string} name
 * @param {object|null} object
 * @throws {Error}
 */
function assertEmptyObject(name, object)
{
  if (object === null)
  {
    return;
  }

  var keyCount = Object.keys(object).length;

  if (keyCount === 0)
  {
    return;
  }

  throw new AssertionError({
    message: util.format(
      "Invalid %s. Expected: 0, actual: %d.", name, keyCount
    ),
    actual: keyCount,
    expected: 0
  });
}
