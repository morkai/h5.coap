'use strict';

var util = require('util');

/**
 * @private
 * @type {object.<number, ContentFormatDefinition>}
 */
var idMap = {};

/**
 * @private
 * @type {object.<number, ContentFormatDefinition>}
 */
var mediaTypeMap = {};

/**
 * @constructor
 * @param {number} id
 * @param {string} mediaType
 * @param {function(Buffer): string} prettyPrint
 */
function ContentFormatDefinition(id, mediaType, prettyPrint)
{
  /**
   * @type {number}
   */
  this.id = id;

  /**
   * @type {string}
   */
  this.mediaType = mediaType;

  /**
   * @type {function(Buffer): string}
   */
  this.prettyPrint = prettyPrint;
}

/**
 * @param {number} id
 * @param {string} mediaType
 * @param {function(Buffer): string} [prettyPrint]
 */
function register(id, mediaType, prettyPrint)
{
  var contentFormatDefinition = new ContentFormatDefinition(
    id, mediaType, prettyPrint || prettyPrintString
  );

  idMap[id] = contentFormatDefinition;
  mediaTypeMap[mediaType] = contentFormatDefinition;
}

/**
 * @param {number|string} idOrMediaType
 * @returns {ContentFormatDefinition}
 * @throws {Error} If there is no content-format definition registered under
 * the specified identifier or media type.
 */
function get(idOrMediaType)
{
  var map = typeof idOrMediaType === 'number' ? idMap : mediaTypeMap;
  var definition = map[idOrMediaType];

  if (!definition)
  {
    throw new Error(
      "Unknown Content-Format identifier or media type: " + idOrMediaType
    );
  }

  return definition;
}

/**
 * @param {number|string} idOrMediaType
 * @param {Buffer} data
 * @returns {string}
 */
function prettyPrint(idOrMediaType, data)
{
  try
  {
    return get(idOrMediaType).prettyPrint(data);
  }
  catch (err)
  {
    return util.inspect(data);
  }
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function prettyPrintString(buffer)
{
  return buffer.toString();
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function prettyPrintJson(buffer)
{
  return JSON.stringify(JSON.parse(buffer.toString()), null, 2);
}

register(0, 'text/plain;charset=utf-8');
register(40, 'application/link-format');
register(41, 'application/xml');
register(42, 'application/octet-stream', util.inspect);
register(47, 'application/exi');
register(50, 'application/json', prettyPrintJson);

module.exports = {
  register: register,
  get: get,
  prettyPrint: prettyPrint
};
