"use strict";

/**
 * @param {number} value
 * @returns {Buffer}
 */
function encodeNumericValue(value)
{
  /*jshint bitwise:false*/

  var buffer;

  if (Math.floor(value) !== value || value > 0xFFFFFFFF)
  {
    buffer = new Buffer(8);
    buffer.writeDoubleBE(value, 0, true);
  }
  else if (value <= 0xFF)
  {
    buffer = new Buffer([value]);
  }
  else if (value <= 0xFFFF)
  {
    buffer = new Buffer(2);
    buffer.writeUInt16BE(value, 0, true);
  }
  else if (value <= 0xFFFFFF)
  {
    buffer = new Buffer([
      (0xFF0000 & value) >> 16,
      (0xFF00 & value) >> 8,
      0xFF & value
    ]);
  }
  else
  {
    buffer = new Buffer(4);
    buffer.writeUInt32BE(value, 0, true);
  }

  return buffer;
}

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function decodeNumericValue(buffer)
{
  /*jshint bitwise:false*/

  var length = buffer.length;

  if (length === 0)
  {
    return 0;
  }

  if (length === 1)
  {
    return buffer[0];
  }

  if (length === 2)
  {
    return buffer.readUInt16BE(0);
  }

  if (length === 3)
  {
    return (buffer[1] << 8) | buffer[2] + (buffer[0] << 16 >>> 0);
  }

  if (length < 8)
  {
    return buffer.readUInt32BE(0);
  }

  return buffer.readDoubleBE(0);
}

/**
 * @param {number} blockSize
 * @returns {number}
 */
function encodeBlockSize(blockSize)
{
  var blockSzx = Math.floor(Math.log(blockSize) / Math.log(2)) - 4;

  if (blockSzx > 6)
  {
    return 6;
  }
  else if (blockSzx < 0)
  {
    return 0;
  }
  else
  {
    return blockSzx;
  }
}

/**
 * @param {number} blockSize
 * @returns {number}
 */
function decodeBlockSize(blockSzx)
{
  if (blockSzx < 0)
  {
    blockSzx = 0;
  }
  else if (blockSzx > 6)
  {
    blockSzx = 6;
  }

  return 1 << (blockSzx + 4);
}

/**
 * @param {Buffer|Array.<number>|null} token
 * @returns {string}
 */
function convertToHexString(buffer, separator)
{
  if (buffer === null || buffer.length === 0)
  {
    return '';
  }

  var hexString = '';

  if (typeof separator !== 'string')
  {
    separator = '';
  }

  for (var i = 0, l = buffer.length; i < l; ++i)
  {
    if (i > 0)
    {
      hexString += separator;
    }

    if (buffer[i] < 10)
    {
      hexString += '0';
    }

    hexString += buffer[i].toString(16);
  }

  return hexString;
}

/**
 * @param {number} value
 * @param {number} length
 * @returns {string}
 */
function convertToBitString(value, length)
{
  return lpad(value.toString(2), '0', length).split('').join(' ');
}

/**
 * @param {string} str
 * @param {string} chr
 * @param {number} length
 * @returns {string}
 */
function lpad(str, chr, length)
{
  str = String(str);

  if (typeof chr === 'undefined')
  {
    chr = '0';
  }

  if (typeof length === 'undefined')
  {
    length = str.length + 1;
  }

  while (str.length < length)
  {
    str = chr + str;
  }

  return str;
}

/**
 * @param {string} str
 * @param {string} chr
 * @param {number} length
 * @returns {string}
 */
function rpad(str, chr, length)
{
  str = String(str);

  if (typeof chr === 'undefined')
  {
    chr = '0';
  }

  if (typeof length === 'undefined')
  {
    length = str.length + 1;
  }

  while (str.length < length)
  {
    str = str + chr;
  }

  return str;
}

module.exports = {
  encodeNumericValue: encodeNumericValue,
  decodeNumericValue: decodeNumericValue,
  encodeBlockSize: encodeBlockSize,
  decodeBlockSize: decodeBlockSize,
  convertToHexString: convertToHexString,
  convertToBitString: convertToBitString,
  lpad: lpad,
  rpad: rpad
};
