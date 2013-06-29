'use strict';

var util = require('util');
var helpers = require('./helpers');
var contentFormatRegistry = require('./contentFormatRegistry');
var BlockOption = require('./BlockOption');

/**
 * @private
 * @type {object.<number, OptionDefinition>}
 */
var numberMap = {};

/**
 * @private
 * @type {object.<string, OptionDefinition>}
 */
var propertyNameMap = {};

/**
 * @constructor
 * @param {object} definition
 * @param {string} definition.propertyName
 * @param {number} definition.number
 * @param {string} definition.name
 * @param {function(*): Option} definition.create
 * @param {boolean} [definition.critical]
 * @param {boolean} [definition.unsafe]
 * @param {boolean} [definition.noCacheKey]
 * @param {boolean} [definition.repeatable]
 * @param {string} [definition.format]
 * @param {number} [definition.minLength]
 * @param {number} [definition.maxLength]
 * @param {Buffer|string|number} [definition.defaultValue]
 * @param {function(Buffer): string} [definition.toString]
 */
function OptionDefinition(definition)
{
  /**
   * @type {string}
   */
  this.propertyName = definition.propertyName;

  /**
   * @type {number}
   */
  this.number = definition.number;

  /**
   * @type {string}
   */
  this.name = definition.name;

  /**
   * @type {function(*): Option}
   */
  this.create = definition.create;

  /**
   * @type {boolean}
   */
  this.critical = definition.critical === true;

  /**
   * @type {boolean}
   */
  this.unsafe = definition.unsafe === true;

  /**
   * @type {boolean}
   */
  this.noCacheKey = definition.noCacheKey === true;

  /**
   * @type {boolean}
   */
  this.repeatable = definition.repeatable === true;

  /**
   * @type {string}
   */
  this.format = definition.format || 'opaque';

  /**
   * @type {number}
   */
  this.minLength = definition.minLength || 0;

  /**
   * @type {number}
   */
  this.maxLength = definition.maxLength || 0;

  /**
   * @type {Buffer|string|number|null}
   */
  this.defaultValue = typeof definition.defaultValue === 'undefined'
    ? null
    : definition.defaultValue;

  /**
   * @type {function(Buffer): string}
   */
  this.toString = definition.toString === Object.prototype.toString
    ? toStringByFormat.bind(null, this.format)
    : definition.toString;
}

/**
 * @param {object} optionDefinition
 * @param {string} optionDefinition.propertyName
 * @param {number} optionDefinition.number
 * @param {string} optionDefinition.name
 * @param {boolean} [optionDefinition.critical]
 * @param {boolean} [optionDefinition.unsafe]
 * @param {boolean} [optionDefinition.noCacheKey]
 * @param {boolean} [optionDefinition.repeatable]
 * @param {string} [optionDefinition.format]
 * @param {number} [optionDefinition.minLength]
 * @param {number} [optionDefinition.maxLength]
 * @param {Buffer|string|number} [optionDefinition.defaultValue]
 * @param {function(Buffer): string} [optionDefinition.toString]
 */
function register(optionDefinition)
{
  optionDefinition = new OptionDefinition(optionDefinition);

  numberMap[optionDefinition.number] = optionDefinition;
  propertyNameMap[optionDefinition.propertyName] = optionDefinition;
}

/**
 * @param {number|string} numberOrPropertyName
 * @returns {OptionDefinition}
 * @throws {Error} If there is no option definition registered under
 * the specified option number or property name.
 */
function get(numberOrPropertyName)
{
  var map =
    typeof numberOrPropertyName === 'number' ? numberMap : propertyNameMap;
  var optionDefinition = map[numberOrPropertyName];

  if (!optionDefinition)
  {
    throw new Error("Unknown message option: " + numberOrPropertyName);
  }

  return optionDefinition;
}

/**
 * @private
 * @param {string} format
 * @param {Buffer} buffer
 * @returns {string}
 */
function toStringByFormat(format, buffer)
{
  /*jshint -W015*/

  switch (format)
  {
    case 'string':
      return buffer.toString();

    case 'empty':
      return '<empty>';

    case 'uint':
      return helpers.decodeNumericValue(buffer).toString();

    default:
      return util.inspect(buffer);
  }
}

/**
 * @private
 * @param {Buffer} buffer
 * @returns {string}
 */
function toMediaTypeString(buffer)
{
  var contentFormatId = helpers.decodeNumericValue(buffer);

  try
  {
    return contentFormatRegistry.get(contentFormatId).mediaType;
  }
  catch (err)
  {
    return contentFormatId.toString();
  }
}

/**
 * @private
 * @param {Buffer} buffer
 * @returns {string}
 */
function toStringBlockOption(buffer)
{
  return BlockOption.decode(buffer).toString();
}

register({
  propertyName: 'ifMatch',
  number: 1,
  critical: true,
  repeatable: true,
  name: 'If-Match',
  maxLength: 8
});

register({
  propertyName: 'uriHost',
  number: 3,
  critical: true,
  unsafe: true,
  name: 'Uri-Host',
  format: 'string',
  minLength: 1,
  maxLength: 255
});

register({
  propertyName: 'eTag',
  number: 4,
  repeatable: true,
  name: 'ETag',
  minLength: 1,
  maxLength: 8
});

register({
  propertyName: 'ifNoneMatch',
  number: 5,
  critical: true,
  name: 'If-None-Match',
  format: 'empty'
});

register({
  propertyName: 'observe',
  number: 6,
  critical: true,
  name: 'Observe',
  format: 'uint'
});

register({
  propertyName: 'uriPort',
  number: 7,
  critical: true,
  unsafe: true,
  name: 'Uri-Port',
  format: 'uint',
  maxLength: 2
});

register({
  propertyName: 'locationPath',
  number: 8,
  repeatable: true,
  name: 'Location-Path',
  format: 'string',
  maxLength: 255
});

register({
  propertyName: 'uriPath',
  number: 11,
  critical: true,
  unsafe: true,
  repeatable: true,
  name: 'Uri-Path',
  format: 'string',
  maxLength: 255
});

register({
  propertyName: 'contentFormat',
  number: 12,
  name: 'Content-Format',
  format: 'uint',
  maxLength: 2,
  toString: toMediaTypeString
});

register({
  propertyName: 'maxAge',
  number: 14,
  unsafe: true,
  name: 'Max-Age',
  format: 'uint',
  maxLength: 4,
  defaultValue: 60
});

register({
  propertyName: 'uriQuery',
  number: 15,
  critical: true,
  unsafe: true,
  repeatable: true,
  name: 'Uri-Query',
  format: 'string',
  maxLength: 255
});

register({
  propertyName: 'accept',
  number: 16,
  name: 'Accept',
  format: 'uint',
  maxLength: 2,
  toString: toMediaTypeString
});

register({
  propertyName: 'locationQuery',
  number: 20,
  repeatable: true,
  name: 'Location-Query',
  format: 'string',
  maxLength: 255
});

register({
  propertyName: 'block2',
  number: 23,
  critical: true,
  unsafe: true,
  name: 'Block2',
  format: 'uint',
  maxLength: 3,
  toString: toStringBlockOption
});

register({
  propertyName: 'block1',
  number: 27,
  critical: true,
  unsafe: true,
  name: 'Block1',
  format: 'uint',
  maxLength: 3,
  toString: toStringBlockOption
});

register({
  propertyName: 'size2',
  number: 28,
  noCacheKey: true,
  name: 'Size2',
  format: 'uint',
  maxLength: 4
});

register({
  propertyName: 'proxyUri',
  number: 35,
  critical: true,
  unsafe: true,
  name: 'Proxy-Uri',
  minLength: 1,
  maxLength: 1034
});

register({
  propertyName: 'proxyScheme',
  number: 39,
  critical: true,
  unsafe: true,
  name: 'Proxy-Scheme',
  format: 'string',
  minLength: 1,
  maxLength: 255
});

register({
  propertyName: 'size1',
  number: 60,
  noCacheKey: true,
  name: 'Size1',
  format: 'uint',
  maxLength: 4
});

module.exports = {
  register: register,
  get: get
};
