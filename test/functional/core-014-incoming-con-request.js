/*
 Handle an unexpected CON request:

 1. Client receives a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x4321
 1       | CON  | 0 bytes      | GET             | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. Client sends a matching RST message:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | RST  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================
*/

'use strict';

var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var unexpectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x7d38,
    token: new Buffer([]),
    uri: '/temperature'
  };
  var expectedRstRequest = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: unexpectedRequest.id
  };

  ctx.socket.scheduleResponse(50, unexpectedRequest);
  ctx.socket.expectRequest(50, expectedRstRequest);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();
  };
});
