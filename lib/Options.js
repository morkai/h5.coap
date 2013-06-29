'use strict';

var Option = require('./Option');

/**
 * @constructor
 * @param {Array.<Option>} [optionList]
 */
function Options(optionList)
{
  /**
   * @private
   * @type {Array.<Option>}
   */
  this.list = optionList || [];

  /**
   * @private
   * @type {boolean}
   */
  this.sorted = false;
}

/**
 * @param {BufferReader} bufferReader
 * @param {Message} message
 */
Options.unserialize = function(bufferReader, message)
{
  /*jshint bitwise:false,maxstatements:21*/

  var lastOptionNumber = 0;

  while (bufferReader.length > 0)
  {
    var optionHeader = bufferReader.shiftByte();

    if (optionHeader === 0xFF)
    {
      return;
    }

    var optionDelta = (optionHeader & 240) >> 4;
    var optionLength = optionHeader & 15;

    if ((optionDelta === 15 && optionLength !== 15)
      || (optionLength === 15 && optionDelta !== 15))
    {
      throw new Error("Invalid payload marker.");
    }

    if (optionDelta === 13)
    {
      optionDelta = bufferReader.shiftByte() + 13;
    }
    else if (optionDelta === 14)
    {
      optionDelta = bufferReader.shiftUInt16() + 269;
    }

    if (optionLength === 13)
    {
      optionLength = bufferReader.shiftByte() + 13;
    }
    else if (optionLength === 14)
    {
      optionLength = bufferReader.shiftUInt16() + 269;
    }

    var optionNumber = lastOptionNumber + optionDelta;
    var optionData = null;

    if (optionLength > 0)
    {
      optionData = bufferReader.shiftBuffer(optionLength);
    }

    message.addOption(new Option(optionNumber, optionData));

    lastOptionNumber = optionNumber;
  }
};

/**
 * @returns {string}
 */
Options.prototype.toString = function()
{
  this.sort();

  var str = '';

  this.list.forEach(function optionToString(option, i)
  {
    if (i > 0)
    {
      str += '\n';
    }

    str += '  - ' + option;
  });

  return str;
};

/**
 * @returns {Array.<object>}
 */
Options.prototype.toJSON = function()
{
  this.sort();

  return this.list.map(function(option)
  {
    return option.toJSON();
  });
};

/**
 * @param {BufferBuilder} bufferBuilder
 */
Options.prototype.serialize = function(bufferBuilder)
{
  this.sort();

  var sortedOptions = this.list;
  var lastOptionNumber = 0;

  for (var i = 0, l = sortedOptions.length; i < l; ++i)
  {
    var option = sortedOptions[i];
    var optionNumber = option.getNumber();

    option.serialize(bufferBuilder, optionNumber - lastOptionNumber);

    lastOptionNumber = optionNumber;
  }
};

/**
 * @returns {number}
 */
Options.prototype.count = function()
{
  return this.list.length;
};

/**
 * @returns {boolean}
 */
Options.prototype.hasAnyOptions = function()
{
  return this.list.length > 0;
};

/**
 * @returns {Array.<Option>}
 */
Options.prototype.getAllOptions = function()
{
  this.sort();

  return [].concat(this.list);
};

/**
 * @param {number} optionNumber
 * @returns {boolean}
 */
Options.prototype.hasOption = function(optionNumber)
{
  for (var i = 0, l = this.list.length; i < l; ++i)
  {
    if (this.list[i].getNumber() === optionNumber)
    {
      return true;
    }
  }

  return false;
};

/**
 * @param {number} optionNumber
 * @returns {Array.<Option>}
 */
Options.prototype.getOptions = function(optionNumber)
{
  return this.list.filter(function getOptionsByNumber(option)
  {
    return option.getNumber() === optionNumber;
  });
};

/**
 * @param {number} optionNumber
 * @returns {Option|null}
 */
Options.prototype.getFirstOption = function(optionNumber)
{
  for (var i = 0, l = this.list.length; i < l; ++i)
  {
    if (this.list[i].getNumber() === optionNumber)
    {
      return this.list[i];
    }
  }

  return null;
};

/**
 * @param {Option} option
 */
Options.prototype.setOption = function(option)
{
  this.removeOptions(option.getNumber());
  this.addOption(option);
};

/**
 * @param {Option} option
 */
Options.prototype.addOption = function(option)
{
  this.list.push(option);
  this.sorted = false;
};

Options.prototype.removeAllOptions = function()
{
  this.list = [];
  this.sorted = true;
};

/**
 * @param {number} optionNumber
 */
Options.prototype.removeOptions = function(optionNumber)
{
  this.list = this.list.filter(function removeByNumber(option)
  {
    return option.getNumber() !== optionNumber;
  });
};

/**
 * @private
 */
Options.prototype.sort = function()
{
  if (this.sorted)
  {
    return;
  }

  this.list.sort(function sortOptionsByNumber(a, b)
  {
    return a.getNumber() - b.getNumber();
  });

  this.sorted = true;
};

module.exports = Options;
