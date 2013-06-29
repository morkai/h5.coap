/*
 Handle an out-of-order blockwise response to a confirmable, blockwise
 POST request (Block2 option included with Block1 option doesn't start at number
 `0`):

 1. User sends a request with the `blockSize` option set to `128`:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 1 0 | 0x0001
 1       | CON  | 0 bytes      | POST            | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : post
 Content-Format: text/plain;charset=utf-8
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |
 |-------------------------------------------------------------|
 |                           BLOCK 2                           |
 |-------------------------------------------------------------|
 ==============================================================================

 2. Client recognizes that the payload of the #1 request is bigger than
 the specified block size, so it constructs and sends the first Block1 request
 instead:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 1 0 | 0x0002
 1       | CON  | 0 bytes      | POST            | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : post
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 0, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Server confirms the first Block1:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0002
 1       | ACK  | 0 bytes      | 2.01 Created    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 0, M: true, SZX: 3 (128 bytes)
 ==============================================================================

 4. Client receives the #3 confirmation. Request emits the`acknowledged` event
 and the `block sent` event.

 5. Client sends a request with the second Block1:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 1 0 | 0x0003
 1       | CON  | 0 bytes      | POST            | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : post
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 1, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 2                           |

 ==============================================================================

 6. Servers confirms the second Block1:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0003
 1       | ACK  | 0 bytes      | 2.01 Created    | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 1, M: true, SZX: 3 (128 bytes)
 ==============================================================================

 7. Client receives the #6 confirmation. Request emits the`block sent` event.

 8. Client sends a request with the third, last Block1:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 1 0 | 0x0004
 1       | CON  | 0 bytes      | POST            | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : post
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 2, M: false, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (63 bytes)
 |-------------------------------------------------------------|
 ==============================================================================

 9. Server confirms the last Block1 and includes an invalid Block2 option
 (doesn't start at number `0`):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0004
 1       | ACK  | 0 bytes      | 2.01 Created    | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 2, M: false, SZX: 3 (128 bytes)
 Block2        : NUM: 1, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           block 2                           |

 ==============================================================================

 10. Client receives the #9 confirmation, recognizes that it contains a Block2
 option, validates it, determines that it's invalid as it doesn't start at
 number `0`, and so ignores the response.

 12. Servers sends the third, last Block2:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x4714
 1       | CON  | 0 bytes      | 2.01 Created    | 18196
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 2, M: false, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (63 bytes)
 |-------------------------------------------------------------|
 ==============================================================================

 13. Client receives the #12 Block2, but because the previous one was invalid,
 this one is reset:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4714
 1       | RST  | 0 bytes      | Empty           | 18196
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 14. After `exchangeTimeout` ms have passed, the client emits
 the `exchange timeout` event and the request emits the `timeout` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:99*/

  var requestPayload =
    '|-------------------------------------------------------------|\n' +
    '|                           BLOCK 1                           |\n' +
    '|-------------------------------------------------------------|\n' +
    '|                           BLOCK 2                           |\n' +
    '|-------------------------------------------------------------|';
  var responsePayload = new Buffer(requestPayload.toLowerCase());
  
  var request = {
    type: Message.Type.CON,
    code: Message.Code.POST,
    uri: '/blocks/put',
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(requestPayload)
  };
  var reqWithBlock0 = {
    type: request.type,
    code: request.code,
    id: 0x0002,
    uri: request.uri,
    block1: {num: 0, m: true, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(0 * 128, 1 * 128)
  };
  var resToBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CREATED,
    id: reqWithBlock0.id,
    block1: {num: 0, m: true, szx: 3}
  };
  var reqWithBlock1 = {
    type: request.type,
    code: request.code,
    id: 0x0003,
    uri: request.uri,
    block1: {num: 1, m: true, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(1 * 128, 2 * 128)
  };
  var resToBlock1 = {
    type: Message.Type.ACK,
    code: Message.Code.CREATED,
    id: reqWithBlock1.id,
    block1: {num: 1, m: true, szx: 3}
  };
  var reqWithBlock2 = {
    type: request.type,
    code: request.code,
    id: 0x0004,
    uri: request.uri,
    block1: {num: 2, m: false, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(2 * 128, 3 * 128)
  };
  var resToBlock2 = {
    type: Message.Type.ACK,
    code: Message.Code.CREATED,
    id: reqWithBlock2.id,
    contentFormat: request.contentFormat,
    block1: {num: 2, m: false, szx: 3},
    block2: {num: 1, m: true, szx: 3},
    payload: responsePayload.slice(1 * 128, 2 * 128)
  };
  var serverBlock2 = {
    type: Message.Type.CON,
    code: Message.Code.CREATED,
    id: 0x4714,
    contentFormat: request.contentFormat,
    block2: {num: 2, m: false, szx: 3},
    payload: responsePayload.slice(2 * 128, 3 * 128)
  };
  var clientBlock2 = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: serverBlock2.id
  };

  ctx.socket.expectRequest(reqWithBlock0);
  ctx.socket.scheduleResponse(50, resToBlock0);
  ctx.socket.expectRequest(50, reqWithBlock1);
  ctx.socket.scheduleResponse(100, resToBlock1);
  ctx.socket.expectRequest(100, reqWithBlock2);
  ctx.socket.scheduleResponse(150, resToBlock2);
  ctx.socket.scheduleResponse(250, serverBlock2);
  ctx.socket.expectRequest(250, clientBlock2);

  var req = ctx.client.request(Message.fromObject(request), {
    blockSize: 128
  });

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 4);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block sent', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(eventSpy, 'timeout');

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], resToBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], resToBlock0, "Invalid `block sent` (#1)."
    );

    eventSpy.args[2][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], resToBlock1, "Invalid `block sent` (#2)."
    );

    eventSpy.args[3][0].should.be.equal('timeout');
  };
});
