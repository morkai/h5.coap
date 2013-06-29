/*
 Handle a blockwise response with an invalid block size (bigger than the one
 specified in the request) to a confirmable GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Uri-Path: invalid-size
 ==============================================================================

 2. Server sends the first block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 0, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Client receives the #2 block. Request emits the `acknowledged` event and
 the `block received` event.

 4. Client sends a request for the second block (128 bytes):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 0 bytes      | GET             | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Uri-Path: invalid-size
 Block2  : NUM: 1, M: false, SZX: 3 (128 bytes)
 ==============================================================================

 5. Servers responds with the second block, but the block size is greater
 than the one specified in the request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 0 bytes      | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 1, M: false, SZX: 4 (256 bytes)
 ------------------------------------------------------------------------------
 Payload (191 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 3                           |
 |-------------------------------------------------------------|
 ==============================================================================

 6. Client receives the #5 block, but recognizes that its SZX is greater than
 the one the client expected and ignores it.

 7. After `exchangeTimeout` ms have passed, the client emits
 the `exchange timeout` event and the request emits the `timeout` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var request = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    uri: '/blocks/get/out-of-order'
  };
  var resWithBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: 0x0001,
    block2: {num: 0, m: true, size: 128},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n'
    )
  };
  var reqForBlock1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    uri: '/blocks/get/out-of-order',
    block2: {num: 1, m: false, size: 128}
  };
  var resWithBlock1 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: reqForBlock1.id,
    block2: {num: 1, m: false, size: 256},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 3                           |\n' +
      '|-------------------------------------------------------------|'
    )
  };

  ctx.socket.expectRequest(request);
  ctx.socket.scheduleResponse(50, resWithBlock0);
  ctx.socket.expectRequest(50, reqForBlock1);
  ctx.socket.scheduleResponse(100, resWithBlock1);

  var req = ctx.client.request(Message.fromObject(request));

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 3);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block received', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(eventSpy, 'timeout');

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], resWithBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[1][1],
      resWithBlock0,
      "Invalid `block received` (#1)."
    );

    eventSpy.args[2][0].should.be.equal('timeout');
  };
});
