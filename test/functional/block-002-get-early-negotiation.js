/*
 Handle a blockwise response of an acceptable size to a confirmable GET request
 with a Block2 option:

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
 Block2  : NUM: 0, M: false, SZX: 2 (64 bytes)
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
 Block2        : NUM: 0, M: true, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (64 bytes)
 |-------------------------------------------------------------|

 ==============================================================================

 3. Client receives the #2 block. Request emits the `acknowledged` event and
 the `block received` event.

 4. Client sends a request for the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 0 bytes      | GET             | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 1, M: false, SZX: 2 (64 bytes)
 ==============================================================================

 5. Servers responds with the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 0 bytes      | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 1, M: true, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (64 bytes)
 |                           BLOCK 2                           |

 ==============================================================================

 6. Client receives the #5 block. Request emits the `block received` event.

 7. Client sends a request for the third block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0003
 1       | CON  | 0 bytes      | GET             | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 2, M: false, SZX: 2 (64 bytes)
 ==============================================================================

 8. Server responds with the third, last block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0003
 1       | ACK  | 0 bytes      | 2.05 Content    | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 2, M: false, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (63 bytes)
 |-------------------------------------------------------------|
 ==============================================================================

 9. Client receives the #8 block. Request emits the `block received` event.

 10. Client recognizes that the #8 block was the last one, and so the request
 emits the `response` event with a new, combined response message.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    uri: '/blocks/get',
    block2: {num: 0, m: false, size: 64}
  };
  var expectedResWithBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: 0x0001,
    block2: {num: 0, m: true, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n'
    )
  };
  var expectedReqForBlock1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    uri: '/blocks/get',
    block2: {num: 1, m: false, size: 64}
  };
  var expectedResWithBlock1 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedReqForBlock1.id,
    block2: {num: 1, m: true, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|                           BLOCK 1                           |\n'
    )
  };
  var expectedReqForBlock2 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0003,
    uri: '/blocks/get',
    block2: {num: 2, m: false, size: 64}
  };
  var expectedResWithBlock2 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedReqForBlock2.id,
    block2: {num: 2, m: false, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|'
    )
  };
  var expectedResponse = {
    type: expectedResWithBlock2.type,
    code: expectedResWithBlock2.code,
    id: expectedResWithBlock2.id,
    block2: expectedResWithBlock2.block2,
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n' +
      '|-------------------------------------------------------------|'
    )
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResWithBlock0);
  ctx.socket.expectRequest(50, expectedReqForBlock1);
  ctx.socket.scheduleResponse(100, expectedResWithBlock1);
  ctx.socket.expectRequest(100, expectedReqForBlock2);
  ctx.socket.scheduleResponse(150, expectedResWithBlock2);

  var req = ctx.client.request(
    Message.fromObject({
      code: Message.Code.GET,
      uri: '/blocks/get'
    }),
    {blockSize: 64}
  );

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 5);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block received', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResWithBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[1][1],
      expectedResWithBlock0,
      "Invalid `block received` (#1)."
    );

    eventSpy.args[2][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[2][1],
      expectedResWithBlock1,
      "Invalid `block received` (#2)."
    );

    eventSpy.args[3][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[3][1],
      expectedResWithBlock2,
      "Invalid `block received` (#3)."
    );

    eventSpy.args[4][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], expectedResponse, "Invalid `response`."
    );

    var lastBlockReceived = eventSpy.args[3][1];
    var response = eventSpy.args[4][1];

    response.should.not.be.equal(lastBlockReceived);
  };
});
