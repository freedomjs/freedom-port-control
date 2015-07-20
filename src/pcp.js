var utils = require('./utils');
var ipaddr = require('ipaddr.js');

/**
* Probe if PCP is supported by the router
* @public
* @method probePcpSupport
* @param {object} activeMappings Table of active Mappings
* @return {Promise<boolean>} A promise for a boolean
*/
var probePcpSupport = function (activeMappings) {
  return addMappingPcp(utils.PCP_PROBE_PORT, utils.PCP_PROBE_PORT, 120,
                       activeMappings).
      then(function (mapping) { return mapping.externalPort !== -1; });
};

/**
* Makes a port mapping in the NAT with PCP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMappingPcp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @param {object} activeMappings Table of active Mappings
* @return {Promise<Mapping>} A promise for the port mapping object 
*                            mapping.externalPort is -1 on failure
*/
var addMappingPcp = function (intPort, extPort, lifetime, activeMappings) {
  var mapping = new utils.Mapping();
  mapping.internalPort = intPort;
  mapping.protocol = 'pcp';

  // If lifetime is zero, we want to refresh every 24 hours
  var reqLifetime = (lifetime === 0) ? 24*60*60 : lifetime;

  // Send PCP requests to ROUTER_IPs and parse the first response
  function _sendPcpRequests() {
    return utils.getPrivateIps().then(function (privateIps) {
      // Construct an array of ArrayBuffers, which are the responses of
      // sendPcpRequest() calls on all the router IPs. An error result
      // is caught and re-passed as null.
      return Promise.all(utils.ROUTER_IPS.map(function (routerIp) {
        // Choose a privateIp based on the currently selected routerIp,
        // using a longest prefix match, and send a PCP request with that IP
        var privateIp = utils.longestPrefixMatch(privateIps, routerIp);
        return sendPcpRequest(routerIp, privateIp, intPort, extPort, 
                                    reqLifetime).
            then(function (pcpResponse) {
              return {"pcpResponse": pcpResponse, "privateIp": privateIp};
            }).
            catch(function (err) {
              return null;
            });
      }));
    }).then(function (responses) {
      // Check if any of the responses are successful (not null)
      for (var i = 0; i < responses.length; i++) {
        if (responses[i] !== null) {
          var responseView = new DataView(responses[i].pcpResponse);
          var ipOctets = [responseView.getUint8(56), responseView.getUint8(57),
                          responseView.getUint8(58), responseView.getUint8(59)];
          var extIp = ipOctets.join('.');

          mapping.externalPort = responseView.getUint16(42);
          mapping.externalIp = extIp;
          mapping.internalIp = responses[i].privateIp;
          mapping.lifetime = responseView.getUint32(4);
          mapping.nonce = [responseView.getUint32(24), 
                           responseView.getUint32(28),
                           responseView.getUint32(32)];
        }
      }
      return mapping;
    }).catch(function (err) {
      return mapping;
    });
  }

  // After receiving a PCP response, set timeouts to delete/refresh the 
  // mapping, add it to activeMappings, and return the mapping object
  return _sendPcpRequests().then(function (mapping) {
    // If the actual lifetime is less than the requested lifetime,
    // setTimeout to refresh the mapping when it expires
    var timeoutId;
    var dLifetime = reqLifetime - mapping.lifetime;
    if (mapping.externalPort !== -1 && dLifetime > 0) {
      timeoutId = setTimeout(addMappingPcp.bind({}, intPort,
        mapping.externalPort, dLifetime, activeMappings), mapping.lifetime*1000);
      mapping.timeoutId = timeoutId;
    }
    // If the original lifetime is 0, refresh every 24 hrs indefinitely
    else if (mapping.externalPort !== -1 && lifetime === 0) {
      timeoutId = setTimeout(addMappingPcp.bind({}, intPort,
        mapping.externalPort, 0, activeMappings), 24*60*60*1000);
      mapping.timeoutId = timeoutId;
    }
    // If we're not refreshing, delete the entry in activeMapping at expiration
    else if (mapping.externalPort !== -1) {
      setTimeout(function () {
        delete activeMappings[mapping.externalPort];
      }, mapping.lifetime*1000);
    }

    // If the mapping operation is successful, add it to activeMappings
    if (mapping.externalPort !== -1) {
      activeMappings[mapping.externalPort] = mapping;
    }
    return mapping;
  });
};

/**
* Deletes a port mapping in the NAT with PCP
* @public
* @method deleteMappingPcp
* @param {number} extPort The external port of the mapping to delete
* @param {object} activeMappings Table of active Mappings
* @return {Promise<boolean>} True on success, false on failure
*/
var deleteMappingPcp = function (extPort, activeMappings) {
  // Send PCP mapping deletion requests to ROUTER_IPS, and if that succeeds,
  // delete the corresponding Mapping object from activeMappings
  return utils.getPrivateIps().then(function (privateIps) {
    // Get the internal port and nonce for this mapping; this may error
    var intPort = activeMappings[extPort].internalPort;
    var nonce = activeMappings[extPort].nonce;

    // Construct an array of ArrayBuffers, which are the responses of
    // sendPmpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(utils.ROUTER_IPS.map(function (routerIp) {
        // Choose a privateIp based on the currently selected routerIp,
        // using a longest prefix match, and send a PCP request with that IP
        var privateIp = utils.longestPrefixMatch(privateIps, routerIp);
        return sendPcpRequest(routerIp, privateIp, intPort, 0, 0, nonce).
            then(function (pcpResponse) { return pcpResponse; }).
            catch(function (err) { return null; });
      }));
  // Parse the response and if successful, delete its Mapping from activeMappings
  }).then(function (responses) {
    // Return true if any of the responses are successful (not null)
    for (var i = 0; i < responses.length; i++) {
      if (responses[i] !== null) {
        // Check that the success code of the response is 0 or 8
        // Success code 8 (NO_RESOURCES) may denote that the mapping does not
        // exist on the router, so we accept it as well
        var responseView = new DataView(responses[i]);
        var successCode = responseView.getUint8(3);
        if (successCode === 0 || successCode === 8) {
          clearTimeout(activeMappings[extPort].timeoutId);
          delete activeMappings[extPort];
          return true;
        } 
      }
    }
    return false;
  }).catch(function (err) {
    return false;
  });
};

/**
* Send a PCP request to the router to map a port
* @private
* @method sendPcpRequest
* @param {string} routerIp The IP address that the router can be reached at
* @param {string} privateIp The private IP address of the user's computer
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
* @param {array} nonce (Optional) A specified nonce for the PCP request
* @return {Promise<ArrayBuffer>} A promise that fulfills with the PCP response
*                                or rejects on timeout
*/
var sendPcpRequest = function (routerIp, privateIp, intPort, extPort, lifetime, 
                               nonce) {
  var socket;

  // Pre-process nonce and privateIp arguments
  if (nonce === undefined) {
    nonce = [utils.randInt(0, 0xffffffff), 
             utils.randInt(0, 0xffffffff), 
             utils.randInt(0, 0xffffffff)];
  }
  var ipOctets = ipaddr.IPv4.parse(privateIp).octets;

  // Bind a socket and send the PCP request from that socket to routerIp
  var _sendPcpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout in wrapper function)
    socket.on('onData', function (pcpResponse) {
      utils.closeSocket(socket);
      F(pcpResponse.data);
    });

    // Bind a UDP port and send a PCP request
    socket.bind('0.0.0.0', 0).then(function (result) {
      // PCP packet structure: https://tools.ietf.org/html/rfc6887#section-11.1
      var pcpBuffer = utils.createArrayBuffer(60, [
        [32, 0, 0x2010000],
        [32, 4, lifetime],
        [32, 8, 0],
        [32, 12, 0],
        [16, 16, 0],
        [16, 18, 0xffff],
        [8, 20, ipOctets[0]],
        [8, 21, ipOctets[1]],
        [8, 22, ipOctets[2]],
        [8, 23, ipOctets[3]],
        [32, 24, nonce[0]],
        [32, 28, nonce[1]],
        [32, 32, nonce[2]],
        [8, 36, 17],
        [16, 37, 0],
        [8, 39, 0],
        [16, 40, intPort],
        [16, 42, extPort],
        [32, 44, 0],
        [32, 48, 0],
        [16, 52, 0],
        [16, 54, 0xffff],
        [32, 56, 0]
      ]);
      socket.sendTo(pcpBuffer, routerIp, 5351);
    });
  });

  // Give _sendPcpRequest 2 seconds before timing out
  return Promise.race([
    utils.countdownReject(2000, 'No PCP response', function () {
      utils.closeSocket(socket);
    }),
    _sendPcpRequest
  ]);
};

module.exports = {
  probePcpSupport: probePcpSupport,
  addMappingPcp: addMappingPcp,
  deleteMappingPcp: deleteMappingPcp
};
