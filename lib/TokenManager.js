'use strict';

var helpers = require('./helpers');

/**
 * @const
 * @type {number}
 */
var MAX_TOKEN_SIZE = 8;

/**
 * @const
 * @type {Array.<number>}
 */
var ZERO_TOKEN_ARRAY = [0, 0, 0, 0, 0, 0, 0, 0];

/**
 * @private
 * @type {string}
 */
var EMPTY_TOKEN_STRING = '';

/**
 * @private
 * @type {Buffer}
 */
var EMPTY_TOKEN_BUFFER = new Buffer(0);

/**
 * @constructor
 * @param {object} [options]
 * @param {number} [options.maxSize]
 * @param {number} [options.emptySafekeepingTime]
 */
function TokenManager(options)
{
  if (typeof options !== 'object')
  {
    options = {};
  }

  /**
   * @private
   * @type {number}
   */
  this.maxSize = typeof options.maxSize === 'number'
    && options.maxSize >= 1
    && options.maxSize <= MAX_TOKEN_SIZE
      ? options.maxSize
      : MAX_TOKEN_SIZE;

  /**
   * @private
   * @type {number}
   */
  this.emptySafekeepingTime = options.emptySafekeepingTime || 48000;

  /**
   * @private
   * @type {Array.<number>}
   */
  this.currentValue = [0];

  /**
   * @private
   * @type {number}
   */
  this.currentIndex = 0;

  /**
   * @private
   * @type {boolean}
   */
  this.maxReached = false;

  /**
   * @private
   * @type {object.<string, boolean>}
   */
  this.acquiredTokens = {};

  /**
   * @private
   * @type {number}
   */
  this.emptyReleaseTime = 0;
}

TokenManager.prototype.destroy = function()
{
  this.currentValue = null;
  this.acquiredTokens = null;
};

/**
 * @param {Buffer|string|null} token
 * @returns {boolean}
 */
TokenManager.prototype.isAcquired = function(token)
{
  if (typeof token !== 'string')
  {
    token = helpers.convertToHexString(token);
  }

  return typeof this.acquiredTokens[token] !== 'undefined';
};

/**
 * @returns {Buffer}
 */
TokenManager.prototype.acquire = function()
{
  var now = Date.now();

  if (!this.isAcquired(EMPTY_TOKEN_STRING)
    && now - this.emptyReleaseTime > this.emptySafekeepingTime)
  {
    this.acquiredTokens[EMPTY_TOKEN_STRING] = true;

    return EMPTY_TOKEN_BUFFER;
  }

  if (!this.maxReached)
  {
    this.nextValue();
  }
  else
  {
    do
    {
      this.nextValue();
    }
    while (this.isAcquired(this.currentValue));
  }

  this.acquiredTokens[helpers.convertToHexString(this.currentValue)] = true;

  return new Buffer(this.currentValue);
};

/**
 * @param {Buffer|string|null} token
 */
TokenManager.prototype.release = function(token)
{
  if (typeof token !== 'string')
  {
    token = helpers.convertToHexString(token);
  }

  if (token === EMPTY_TOKEN_STRING)
  {
    this.emptyReleaseTime = Date.now();
  }

  delete this.acquiredTokens[token];
};

/**
 * @private
 */
TokenManager.prototype.nextValue = function()
{
  if (this.isValueMaxed())
  {
    this.resizeValue();
  }
  else
  {
    this.incrementValue();
  }
};

/**
 * @private
 */
TokenManager.prototype.isValueMaxed = function()
{
  for (var i = 0, l = this.currentValue.length; i < l; ++i)
  {
    if (this.currentValue[i] !== 0xFF)
    {
      return false;
    }
  }

  return true;
};

/**
 * @private
 */
TokenManager.prototype.resizeValue = function()
{
  if (this.currentValue.length + 1 > this.maxSize)
  {
    this.currentValue = [0];
  }
  else
  {
    this.currentValue = ZERO_TOKEN_ARRAY.slice(0, this.currentValue.length + 1);
  }

  this.currentIndex = 0;
};

/**
 * @private
 */
TokenManager.prototype.incrementValue = function()
{
  if (this.currentValue[this.currentIndex] === 0xFF)
  {
    while (this.currentValue[this.currentIndex] === 0xFF)
    {
      this.currentValue[this.currentIndex++] = 0;
    }

    ++this.currentValue[this.currentIndex];

    this.currentIndex = 0;
  }
  else
  {
    this.currentValue[this.currentIndex]++;
  }
};

module.exports = TokenManager;
