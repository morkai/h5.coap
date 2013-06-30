'use strict';

var util = require('util');
var helpers = require('./helpers');

/**
 * @constructor
 * @param {number} optionNumber
 * @param {number} num
 * @param {boolean} m
 * @param {number} szx
 */
function BlockOption(optionNumber, num, m, szx)
{
  /**
   * @type {number}
   */
  this.optionNumber = optionNumber;

  /**
   * @type {number}
   */
  this.num = num;

  /**
   * @type {boolean}
   */
  this.m = m;

  /**
   * @type {number}
   */
  this.szx = szx;

  /**
   * @type {number}
   */
  this.size = helpers.decodeBlockSize(szx);
}

/**
 * @param {Buffer} data
 * @param {number} [optionNumber]
 * @returns {BlockOption}
 */
BlockOption.decode = function(data, optionNumber)
{
  /*jshint -W015,bitwise:false*/

  var num = -1;
  var m = data.length > 0 && (data[data.length - 1] & 8) === 8;
  var szx = data.length > 0 ? data[data.length - 1] & 7 : 0;

  switch (data.length)
  {
    case 0:
      num = 0;
      break;

    case 1:
      num = data[0];
      break;

    case 2:
      num = data.readUInt16BE(0, true);
      break;

    default:
      num = (data[0] << 16) | data.readUInt16BE(1, true);
      break;
  }

  num = num >> 4;

  return new BlockOption(optionNumber || -1, num, m, szx);
};

/**
 * @param {number} num
 * @param {boolean} m
 * @param {number} szx
 * @returns {Buffer}
 */
BlockOption.encode = function(num, m, szx)
{
  /*jshint bitwise:false*/

  var data;

  if (num <= 15)
  {
    data = new Buffer([num << 4]);
  }
  else if (num <= 4095)
  {
    data = new Buffer([(num & 4080) >> 4, (num & 15) << 4]);
  }
  else
  {
    data = new Buffer([
      (num & 1044480) >> 12,
      (num & 4080) >> 4,
      (num & 15) << 4
    ]);
  }

  var lastByteIndex = data.length - 1;

  data[lastByteIndex] |= szx;

  if (m)
  {
    data[lastByteIndex] |= 8;
  }

  return data;
};

/**
 * @returns {string}
 */
BlockOption.prototype.toString = function()
{
  var Option = require('./Message').Option;
  var blockName = '';

  if (this.optionNumber === Option.BLOCK1)
  {
    blockName = '(Block1) ';
  }
  else if (this.optionNumber === Option.BLOCK2)
  {
    blockName = '(Block2) ';
  }

  return util.format(
    "%sNUM: %d, M: %s, SZX: %d (%d bytes)",
    blockName,
    this.num,
    this.m,
    this.szx,
    this.size
  );
};

module.exports = BlockOption;
