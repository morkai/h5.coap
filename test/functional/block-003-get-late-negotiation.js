/*
 Handle a blockwise response of an unacceptable size to a confirmable GET
 request without a Block2 option:

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
 ==============================================================================

 2. Server sends the first block of size 128:
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
 Payload (64 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Client receives the #2 block. Request emits the `acknowledged` event and
 the `block received` event.

 4. Client sends a request for the third block (not the second one, because
 the block size specified by the server (128) is too big for the client (64)):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 0 bytes      | GET             | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 2, M: false, SZX: 2 (64 bytes)
 ==============================================================================

 5. Servers responds with the third block of size 64:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 0 bytes      | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 2, M: true, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (64 bytes)
 |-------------------------------------------------------------|

 ==============================================================================

 6. Client receives the #5 block. Request emits the `block received` event.

 7. Client sends a request for the fourth block of size 64:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0003
 1       | CON  | 0 bytes      | GET             | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 3, M: false, SZX: 2 (64 bytes)
 ==============================================================================

 8. Server responds with the fourth block of size 64:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0003
 1       | ACK  | 0 bytes      | 2.05 Content    | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 3, M: true, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (64 bytes)
 |                           BLOCK 2                           |

 ==============================================================================

 9. Client receives the #8 block. Request emits the `block received` event.

 10. Client sends a request for the fifth block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0004
 1       | CON  | 0 bytes      | GET             | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 4, M: false, SZX: 2 (64 bytes)
 ==============================================================================

 11. Server responds with the fifth block of size 64:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0004
 1       | ACK  | 0 bytes      | 2.05 Content    | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 4, M: false, SZX: 2 (64 bytes)
 ------------------------------------------------------------------------------
 Payload (63 bytes)
 |-------------------------------------------------------------|
 ==============================================================================

 12. Client receives the #11 block. Request emits the `block received` event.

 13. Client recognizes that the #11 block was the last one, and so the request
 emits the `response` event with a new, combined response message.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var expectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    uri: '/blocks/get'
  };
  var expectedResWithBlock0 = {
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
  var expectedReqForBlock2 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    uri: '/blocks/get',
    block2: {num: 2, m: false, size: 64}
  };
  var expectedResWithBlock2 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedReqForBlock2.id,
    block2: {num: 2, m: true, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n'
    )
  };
  var expectedReqForBlock3 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0003,
    uri: '/blocks/get',
    block2: {num: 3, m: false, size: 64}
  };
  var expectedResWithBlock3 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedReqForBlock3.id,
    block2: {num: 3, m: true, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|                           BLOCK 2                           |\n'
    )
  };
  var expectedReqForBlock4 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0004,
    uri: '/blocks/get',
    block2: {num: 4, m: false, size: 64}
  };
  var expectedResWithBlock4 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedReqForBlock4.id,
    block2: {num: 4, m: false, size: 64},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|'
    )
  };
  var expectedResponse = {
    type: expectedResWithBlock4.type,
    code: expectedResWithBlock4.code,
    id: expectedResWithBlock4.id,
    block2: expectedResWithBlock4.block2,
    contentFormat: expectedResWithBlock4.contentFormat,
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n' +
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 2                           |\n' +
      '|-------------------------------------------------------------|'
    )
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResWithBlock0);
  ctx.socket.expectRequest(50, expectedReqForBlock2);
  ctx.socket.scheduleResponse(100, expectedResWithBlock2);
  ctx.socket.expectRequest(100, expectedReqForBlock3);
  ctx.socket.scheduleResponse(150, expectedResWithBlock3);
  ctx.socket.expectRequest(150, expectedReqForBlock4);
  ctx.socket.scheduleResponse(200, expectedResWithBlock4);

  var req = ctx.client.request(Message.fromObject(expectedRequest), {
    blockSize: 64
  });

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 6);

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
      expectedResWithBlock2,
      "Invalid `block received` (#2)."
    );

    eventSpy.args[3][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[3][1],
      expectedResWithBlock3,
      "Invalid `block received` (#3)."
    );

    eventSpy.args[4][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[4][1],
      expectedResWithBlock4,
      "Invalid `block received` (#4)."
    );

    eventSpy.args[5][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[5][1], expectedResponse, "Invalid `response`."
    );

    var lastBlockReceived = eventSpy.args[4][1];
    var response = eventSpy.args[5][1];

    response.should.not.be.equal(lastBlockReceived);
  };
});
