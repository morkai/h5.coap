/*globals describe:true,it:true*/
/*jshint maxlen:999*/

'use strict';

require('should');

var helpers = require('../helpers');
var EndpointAddress = require(helpers.LIB_DIR + '/EndpointAddress');

describe("EndpointAddress", function()
{
  describe("toString", function()
  {
    it("should not include a default port for IPv4 addresses", function()
    {
      var expected = '127.0.0.1';
      var actual = new EndpointAddress('127.0.0.1').toString();

      actual.should.be.equal(expected);
    });

    it("should not include a default port for IPv6 addresses", function()
    {
      var expected = '[2222::3]';
      var actual = new EndpointAddress('2222::3').toString();

      actual.should.be.equal(expected);
    });

    it("should include the specified port for IPv4 addresses", function()
    {
      var expected = '127.0.0.1:1337';
      var actual = new EndpointAddress('127.0.0.1', 1337).toString();

      actual.should.be.equal(expected);
    });

    it("should not include a default port for IPv6 addresses", function()
    {
      var expected = '[2222::3]:1337';
      var actual = new EndpointAddress('2222::3', 1337).toString();

      actual.should.be.equal(expected);
    });
  });

  describe("toJSON", function()
  {
    it("should return an object with `address` and `port` properties", function()
    {
      var expected = {address: '127.0.0.1', port: 1337};
      var actual = new EndpointAddress('127.0.0.1', 1337).toJSON();

      actual.should.be.eql(expected);
    });

    it("should include the default port", function()
    {
      var expected = {address: '127.0.0.1', port: 5683};
      var actual = new EndpointAddress('127.0.0.1').toJSON();

      actual.should.be.eql(expected);
    });

    it("should not enclose an IPv6 address in square brackets", function()
    {
      var expected = {address: '2222::3', port: 1337};
      var actual = new EndpointAddress('2222::3', 1337).toJSON();

      actual.should.be.eql(expected);
    });
  });

  describe("getAddress", function()
  {
    it("should return an address specified in the constructor", function()
    {
      var expected = '127.0.0.1';
      var actual = new EndpointAddress('127.0.0.1', 1337).getAddress();

      actual.should.be.equal(expected);
    });
  });

  describe("getPort", function()
  {
    it("should return a default port if one wasn't specified in the constructor", function()
    {
      var expected = 5683;
      var actual = new EndpointAddress('127.0.0.1').getPort();

      actual.should.be.equal(expected);
    });

    it("should return a port specified in the constructor", function()
    {
      var expected = 1337;
      var actual = new EndpointAddress('127.0.0.1', 1337).getPort();

      actual.should.be.equal(expected);
    });
  });

  describe("isIPv6", function()
  {
    it("should return `true` if the specified address contains the `:` character", function()
    {
      var expected = true;
      var actual = new EndpointAddress('2222::3').isIPv6();

      actual.should.be.equal(expected);
    });

    it("should return `false` if the specified address doesn't contain the `:` character", function()
    {
      var expected = false;
      var actual = new EndpointAddress('127.0.0.1').isIPv6();

      actual.should.be.equal(expected);
    });
  });
});
