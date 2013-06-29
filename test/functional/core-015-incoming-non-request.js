/*
 Handle an unexpected NON request:

 1. Client receives a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 1  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x4321
 1       | NON  | 0 bytes      | GET             | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. Client ignores the #1 request.
*/

'use strict';

var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var unexpectedRequest = {
    type: Message.Type.NON,
    code: Message.Code.GET,
    id: 0x4321,
    token: new Buffer([]),
    uri: '/temperature'
  };

  ctx.socket.scheduleResponse(50, unexpectedRequest);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();
  };
});
