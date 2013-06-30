/*globals describe:true,it:true*/
/*jshint maxlen:999*/

'use strict';

require('should');

var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR + '/Message');
var BlockOption = require(helpers.LIB_DIR + '/BlockOption');

describe("BlockOption", function()
{
  it("should set constructor arguments to properties", function()
  {
    var blockOption = new BlockOption(Message.Option.BLOCK2, 1, true, 5);

    blockOption.optionNumber.should.be.equal(Message.Option.BLOCK2);
    blockOption.num.should.be.equal(1);
    blockOption.m.should.be.equal(true);
    blockOption.szx.should.be.equal(5);
  });

  it("should calculate the size property from the specified szx constructor argument", function()
  {
    new BlockOption(-1, 0, false, 0).size.should.be.equal(16);
    new BlockOption(-1, 0, false, 1).size.should.be.equal(32);
    new BlockOption(-1, 0, false, 4).size.should.be.equal(256);
    new BlockOption(-1, 0, false, 6).size.should.be.equal(1024);
  });

  describe("decode", function()
  {
    it("should decode to 0,false,0 if the specified data buffer was empty", function()
    {
      BlockOption.decode(new Buffer(0)).should.be.eql(new BlockOption(-1, 0, false, 0));
    });

    it("should set the more flag to false if the fourth bit of the last byte was 0", function()
    {
      BlockOption.decode(new Buffer([parseInt('00010110', 2)])).m.should.be.equal(false);
    });

    it("should set the more flag to true if the fourth bit of the last byte was 1", function()
    {
      BlockOption.decode(new Buffer([parseInt('00011110', 2)])).m.should.be.equal(true);
    });

    it("should set the szx to a value of the last 3 bits of the last byte", function()
    {
      BlockOption.decode(new Buffer([parseInt('00010110', 2)])).szx.should.be.equal(6);
    });

    it("should set the 4 bit block number", function()
    {
      var data = new Buffer([
        parseInt('01110110', 2)
      ]);

      BlockOption.decode(data).num.should.be.equal(parseInt('0111', 2));
    });

    it("should set the 12 bit block number", function()
    {
      var data = new Buffer([
        parseInt('11001100', 2),
        parseInt('01110110', 2)
      ]);

      BlockOption.decode(data).num.should.be.equal(parseInt('110011000111', 2));
    });

    it("should set the 20 bit block number", function()
    {
      var data = new Buffer([
        parseInt('10101010', 2),
        parseInt('11001100', 2),
        parseInt('01110110', 2)
      ]);

      BlockOption.decode(data).num.should.be.equal(parseInt('10101010110011000111', 2));
    });

    it("should set the optionNumber property to -1 if one was not specified", function()
    {
      BlockOption.decode(new Buffer([0])).optionNumber.should.be.equal(-1);
    });

    it("should set the optionNumber property to the specified one", function()
    {
      BlockOption.decode(new Buffer([0]), Message.Option.BLOCK2).optionNumber.should.be.equal(Message.Option.BLOCK2);
    });
  });

  describe("encode", function()
  {
    it("should encode 0,true,3", function()
    {
      BlockOption.encode(0, true, 3).should.be.eql(new Buffer([parseInt('00001011', 2)]));
    });

    it("should encode 15,false,0", function()
    {
      BlockOption.encode(15, false, 0).should.be.eql(new Buffer([parseInt('11110000', 2)]));
    });

    it("should encode 16,false,6", function()
    {
      BlockOption.encode(16, false, 6).should.be.eql(new Buffer([
        parseInt('00000001', 2),
        parseInt('00000110', 2)
      ]));
    });

    it("should encode 4095,true,3", function()
    {
      BlockOption.encode(4095, true, 3).should.be.eql(new Buffer([
        parseInt('11111111', 2),
        parseInt('11111011', 2)
      ]));
    });

    it("should encode 4096,false,0", function()
    {
      BlockOption.encode(4096, false, 0).should.be.eql(new Buffer([
        parseInt('00000001', 2),
        parseInt('00000000', 2),
        parseInt('00000000', 2)
      ]));
    });

    it("should encode 10000,true,5", function()
    {
      BlockOption.encode(10000, true, 5).should.be.eql(new Buffer([
        parseInt('00000010', 2),
        parseInt('01110001', 2),
        parseInt('00001101', 2)
      ]));
    });

    it("should encode 1048575,false,0", function()
    {
      BlockOption.encode(1048575, false, 0).should.be.eql(new Buffer([
        parseInt('11111111', 2),
        parseInt('11111111', 2),
        parseInt('11110000', 2)
      ]));
    });
  });

  describe("toString", function()
  {
    it("should return a string", function()
    {
      new BlockOption(-1, 0, false, 0).toString().should.be.a('string');
    });

    it("should include `Block1` string if the specified option number was Message.Option.BLOCK1", function()
    {
      new BlockOption(Message.Option.BLOCK1, 0, false, 0).toString().should.match(/Block1/);
    });

    it("should include `Block2` string if the specified option number was Message.Option.BLOCK2", function()
    {
      new BlockOption(Message.Option.BLOCK2, 0, false, 0).toString().should.match(/Block2/);
    });

    it("should not include the option name if the option number was not specified", function()
    {
      new BlockOption(-1, 0, false, 0).toString().should.not.match(/Block1|Block2/);
    });
  });
});
