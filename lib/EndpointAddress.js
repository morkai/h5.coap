'use strict';

/**
 * @constructor
 * @param {string} address
 * @param {number} [port]
 */
function EndpointAddress(address, port)
{
  /**
   * @private
   * @type {string}
   */
  this.address = address.indexOf(':') === -1 ? address : expandIpv6(address);

  /**
   * @private
   * @type {number}
   */
  this.port = Number(port || EndpointAddress.DEFAULT_PORT);
}

/**
 * @const
 * @type {number}
 */
EndpointAddress.DEFAULT_PORT = 5683;

/**
 * @returns {string}
 */
EndpointAddress.prototype.toString = function()
{
  var str = this.isIPv6()
    ? '[' + this.address + ']'
    : this.address;

  if (this.port !== EndpointAddress.DEFAULT_PORT)
  {
    str += ':' + this.port;
  }

  this.toString = function() { return str; };

  return str;
};

/**
 * @returns {{address: string, port: number}}
 */
EndpointAddress.prototype.toJSON = function()
{
  return {
    address: this.address,
    port: this.port
  };
};

/**
 * @returns {string}
 */
EndpointAddress.prototype.getAddress = function()
{
  return this.address;
};

/**
 * @returns {number}
 */
EndpointAddress.prototype.getPort = function()
{
  return this.port;
};

/**
 * @returns {boolean}
 */
EndpointAddress.prototype.isIPv6 = function()
{
  return this.address.indexOf(':') !== -1;
};

/**
 * @private
 * @param {string} address
 * @returns {string}
 * @see https://code.google.com/p/closure-library/source/browse/closure/goog/net/ipaddress.js
 */
function expandIpv6(address)
{
  if (address.length === 39)
  {
    return address;
  }

  address = address.split('::');

  var basePart = address[0].split(':');
  var secondPart = address.length === 1 ? [] : address[1].split(':');

  if (basePart.length === 1 && basePart[0] === '')
  {
    basePart = [];
  }

  if (secondPart.length === 1 && secondPart[0] === '')
  {
    secondPart = [];
  }

  var gap = 8 - (basePart.length + secondPart.length);
  var result = [];
  var i;
  var l;

  for (i = 0, l = basePart.length; i < l; ++i)
  {
    result.push(pad(basePart[i]));
  }

  for (i = 0; i < gap; ++i)
  {
    result.push('0000');
  }

  for (i = 0, l = secondPart.length; i < l; ++i)
  {
    result.push(pad(secondPart[i]));
  }

  return result.join(':').toLowerCase();
}

/**
 * @private
 * @param {string} str
 * @returns {string}
 */
function pad(str)
{
  var len = str.length;

  if (len === 4)
  {
    return str;
  }

  if (len === 1)
  {
    return '000' + str;
  }

  if (len === 2)
  {
    return '00' + str;
  }

  return '0' + str;
}

module.exports = EndpointAddress;
