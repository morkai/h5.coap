'use strict';

var helpers = require('./helpers');
var optionNumberRegistry = require('./optionNumberRegistry');

/**
 * @constructor
 * @param {number} number
 * @param {Buffer|null} data
 */
function Option(number, data)
{
  /**
   * @private
   * @type {OptionDefinition}
   */
  this.definition = optionNumberRegistry.get(number);

  /**
   * @private
   * @type {Buffer|null}
   */
  this.data = data;
}

/**
 * @param {boolean} [includeName]
 * @returns {string}
 */
Option.prototype.toString = function(includeName)
{
  var str = '';

  if (includeName !== false)
  {
    str += this.definition.name + ': ';
  }

  if (this.hasData() || this.definition.format === 'uint')
  {
    str += this.definition.toString(this.getData());
  }
  else
  {
    str += '<empty>';
  }

  return str;
};

/**
 * @returns {{number: number, data: Array.<number>}}
 */
Option.prototype.toJSON = function()
{
  return {
    number: this.definition.number,
    data: this.data === null ? [] : this.data.toJSON()
  };
};

Option.prototype.getDefinition = function()
{
  return this.definition;
};

/**
 * @returns {number}
 */
Option.prototype.getNumber = function()
{
  return this.definition.number;
};

/**
 * @returns {string}
 */
Option.prototype.getName = function()
{
  return this.definition.name;
};

/**
 * @returns {number}
 */
Option.prototype.hasData = function()
{
  return this.data !== null && this.data.length > 0;
};

/**
 * @returns {Buffer}
 */
Option.prototype.getData = function()
{
  return this.data === null ? new Buffer(0) : this.data;
};

/**
 * @param {string} [encoding]
 * @returns {string}
 */
Option.prototype.getStringValue = function(encoding)
{
  return this.data === null ? '' : this.data.toString(encoding || 'utf8');
};

/**
 * @returns {number}
 */
Option.prototype.getNumericValue = function()
{
  return this.data === null ? 0 : helpers.decodeNumericValue(this.data);
};

/**
 * @param {BufferBuilder} bufferBuilder
 * @param {number} optionDelta
 */
Option.prototype.serialize = function(bufferBuilder, optionDelta)
{
  /*jshint bitwise:false*/

  var optionLength = this.data === null ? 0 : this.data.length;
  var deltaNibble = this.getOptionNibble(optionDelta);
  var lengthNibble = this.getOptionNibble(optionLength);

  bufferBuilder.pushByte((deltaNibble << 4) | lengthNibble);

  this.pushExtendedOptionValue(bufferBuilder, deltaNibble, optionDelta);
  this.pushExtendedOptionValue(bufferBuilder, lengthNibble, optionLength);

  if (optionLength > 0)
  {
    bufferBuilder.pushBuffer(this.data);
  }
};

/**
 * @private
 * @param {number} value
 * @returns {number}
 */
Option.prototype.getOptionNibble = function(value)
{
  if (value <= 12)
  {
    return value;
  }
  else if (value <= 0xFF + 13)
  {
    return 13;
  }
  else
  {
    return 14;
  }
};

/**
 * @private
 * @param {BufferBuilder} bufferBuilder
 * @param {number} nibble
 * @param {number} value
 */
Option.prototype.pushExtendedOptionValue =
  function(bufferBuilder, nibble, value)
{
  if (nibble === 13)
  {
    bufferBuilder.pushUInt8(value - 13);
  }
  else if (nibble === 14)
  {
    bufferBuilder.pushUInt16(value - 269);
  }
};

module.exports = Option;
