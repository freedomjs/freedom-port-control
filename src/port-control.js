var PortControl = function (dispatchEvent) {
  this.dispatchEvent = dispatchEvent;
};

/**
 * List of popular router default IPs
 * http://www.techspot.com/guides/287-default-router-ip-addresses/
*/
var routerIps = ['192.168.1.1', '192.168.2.1', '192.168.11.1',
  '192.168.0.1', '192.168.0.30', '192.168.0.50', '192.168.20.1',
  '192.168.30.1', '192.168.62.1', '192.168.100.1', '192.168.102.1',
  '192.168.1.2g54', '192.168.10.1', '192.168.123.254', '192.168.4.1',
  '10.0.1.1', '10.1.1.1', '10.0.0.138', '10.0.0.2', '10.0.0.138'];

// TODO(kennysong): Refresh mapping
// TODO(kennysong): Increase mapping lifetime

/**
* Opens a specified port in the NAT with NAT-PMP,
* and automatically refreshes the port mapping every two minutes
* @public
* @method openPortWithPmp
* @return {Promise<number>} A promise for the external port returned by the NAT, -1 if failed
*/
PortControl.prototype.openPortWithPmp = function (internalPort, externalPort) {
  var sendPmpRequest = this.sendPmpRequest.bind(this);

  return this.getPrivateIp().then(function (privateIp) {
    // Return an array of ArrayBuffers, which are the responses of
    // sendPmpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(routerIps.map(function (routerIp) {
      return sendPmpRequest(routerIp, privateIp, internalPort, externalPort).
          then(function (pmpResponse) { return pmpResponse; }).
          catch(function (err) { return null; });
    }));
  }).then(function (responses) {
    // Check if any of the responses are successful (not null)
    // and parse the external IP returned by the router
    for (var i = 0; i < responses.length; i++) {
      if (responses[i] !== null) {
        var responseView = new DataView(responses[i]);
        var externalPort = responseView.getUint16(10);
        return externalPort;
      }
    }
    return -1;
  });
};

/**
* Probe if NAT-PMP is supported by the router
* @public
* @method probePmpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePmpSupport = function () {
  return this.openPortWithPmp(55555, 55555).then(function (externalPort) {
    if (externalPort !== -1) { return true; }
    return false;
  });
};

/**
* Send a NAT-PMP request to the router to open/map a port
* @private
* @method sendPmpRequest
* @param {string} routerIp The IP address that the router can be reached at
* @param {string} privateIp The private IP address of the user's computer
* @param {string} internalPort The internal port on the computer to map to
* @param {string} externalPort The external port on the router to map to
* @return {Promise<ArrayBuffer>} A promise that fulfills with the NAT-PMP response, or rejects on timeout
*/
PortControl.prototype.sendPmpRequest = function (routerIp, privateIp, internalPort, externalPort) {
  var socket;
  var closeSocket = this.closeSocket;

  var _sendPmpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout in wrapper function)
    socket.on('onData', function (pmpResponse) {
      closeSocket(socket);
      F(pmpResponse.data);
    });

    // TODO(kennysong): Handle an error case for all socket.bind() when this issue is fixed:
    // https://github.com/uProxy/uproxy/issues/1687

    // Bind a UDP port and send a NAT-PMP request
    socket.bind(privateIp, 0).then(function (result) {
      // Construct the NAT-PMP map request as an ArrayBuffer
      // Map internal port 55555 to external port 55555 w/ 120 sec lifetime
      var pmpBuffer = new ArrayBuffer(12);
      var pmpView = new DataView(pmpBuffer);
      // Version and OP fields (1 byte each)
      pmpView.setInt8(0, 0);
      pmpView.setInt8(1, 1);
      // Reserved, internal port, external port fields (2 bytes each)
      pmpView.setInt16(2, 0, false);
      pmpView.setInt16(4, internalPort, false);
      pmpView.setInt16(6, externalPort, false);
      // Mapping lifetime field (4 bytes)
      pmpView.setInt32(8, 120, false);

      socket.sendTo(pmpBuffer, routerIp, 5351);
    });
  });

  // Give _sendPmpRequest 2 seconds before timing out
  return Promise.race([
    this.countdownReject(2000, 'No NAT-PMP response', function () {
      closeSocket(socket);
    }),
    _sendPmpRequest
  ]);
};

/**
* Opens a specified port in the NAT with PCP,
* and automatically refreshes the port mapping every two minutes
* @public
* @method openPortWithPcp
* @return {Promise<number>} A promise for the external port returned by the NAT, -1 if failed
*/
PortControl.prototype.openPortWithPcp = function (internalPort, externalPort) {
  var sendPcpRequest = this.sendPcpRequest.bind(this);

  return this.getPrivateIp().then(function (privateIp) {
    // Return an array of ArrayBuffers, which are the responses of
    // sendPcpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(routerIps.map(function (routerIp) {
      return sendPcpRequest(routerIp, privateIp, internalPort, externalPort).
          then(function (pcpResponse) { return pcpResponse; }).
          catch(function (err) { return null; });
    }));
  }).then(function (responses) {
    // Check if any of the responses are successful (not null)
    // and parse the external IP returned by the router
    for (var i = 0; i < responses.length; i++) {
      if (responses[i] !== null) {
        var responseView = new DataView(responses[i]);
        var externalPort = responseView.getUint16(42);
        return externalPort;
      }
    }
    return -1;
  });
};

/**
* Probe if PCP is supported by the router
* @public
* @method probePcpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePcpSupport = function () {
  return this.openPortWithPcp(55556, 55556).then(function (externalPort) {
    if (externalPort !== -1) { return true; }
    return false;
  });
};

/**
* Send a PCP request to the router to open/map a port
* @private
* @method sendPcpRequest
* @param {string} routerIp The IP address that the router can be reached at
* @param {string} privateIp The private IP address of the user's computer
* @param {string} internalPort The internal port on the computer to map to
* @param {string} externalPort The external port on the router to map to
* @return {Promise<ArrayBuffer>} A promise that fulfills with the PCP response, or rejects on timeout
*/
PortControl.prototype.sendPcpRequest = function (routerIp, privateIp, internalPort, externalPort) {
  var socket;
  var closeSocket = this.closeSocket;
  var randInt = this.randInt;

  var _sendPcpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout in wrapper function)
    socket.on('onData', function (pcpResponse) {
      closeSocket(socket);
      F(pcpResponse.data);
    });

    // Bind a UDP port and send a PCP request
    socket.bind(privateIp, 0).then(function (result) {
      // Create the PCP MAP request as an ArrayBuffer
      // Map internal port 55556 to external port 55556 w/ 120 sec lifetime
      var pcpBuffer = new ArrayBuffer(60);
      var pcpView = new DataView(pcpBuffer);
      // Version field (1 byte)
      pcpView.setInt8(0, parseInt('00000010', 2));
      // R and Opcode fields (1 bit + 7 bits)
      pcpView.setInt8(1, parseInt('00000001', 2));
      // Reserved field (2 bytes)
      pcpView.setInt16(2, 0, false);
      // Requested lifetime (4 bytes)
      pcpView.setInt32(4, 120, false);
      // Client IP address (128 bytes; we use the IPv4 -> IPv6 mapping)
      pcpView.setInt32(8, 0, false);
      pcpView.setInt32(12, 0, false);
      pcpView.setInt16(16, 0, false);
      pcpView.setInt16(18, 0xffff, false);
      // Start of IPv4 octets of the client's private IP
      // var ipOctets = ipaddr.IPv4.parse(privateIp).octets;
      // TODO(kennysong): Use the ipaddr module!
      var ipOctets = privateIp.split('.').map(function (n) { return parseInt(n); });
      pcpView.setInt8(20, ipOctets[0]);
      pcpView.setInt8(21, ipOctets[1]);
      pcpView.setInt8(22, ipOctets[2]);
      pcpView.setInt8(23, ipOctets[3]);
      // Mapping Nonce (12 bytes)
      pcpView.setInt32(24, randInt(0, 0xffffffff), false);
      pcpView.setInt32(28, randInt(0, 0xffffffff), false);
      pcpView.setInt32(32, randInt(0, 0xffffffff), false);
      // Protocol (1 byte)
      pcpView.setInt8(36, 17);
      // Reserved (3 bytes)
      pcpView.setInt16(37, 0, false);
      pcpView.setInt8(39, 0);
      // Internal and external ports
      pcpView.setInt16(40, internalPort, false);
      pcpView.setInt16(42, externalPort, false);
      // External IP address (128 bytes; we use the all-zero IPv4 -> IPv6 mapping)
      pcpView.setFloat64(44, 0, false);
      pcpView.setInt16(52, 0, false);
      pcpView.setInt16(54, 0xffff, false);
      pcpView.setInt32(56, 0, false);

      socket.sendTo(pcpBuffer, routerIp, 5351);
    });
  });

  // Give _sendPcpRequest 2 seconds before timing out
  return Promise.race([
    this.countdownReject(2000, 'No PCP response', function () {
      closeSocket(socket);
    }),
    _sendPcpRequest
  ]);
};

/**
* Opens a specified port in the NAT with UPnP AddPortMapping,
* and automatically refreshes the port mapping every two minutes
* @public
* @method openPortWithUpnp
* @return {Promise<number>} A promise for the external port returned by the NAT, -1 if failed
*/
PortControl.prototype.openPortWithUpnp = function (internalPort, externalPort) {
  var sendUpnpRequest = this.sendUpnpRequest.bind(this);

  return this.getPrivateIp().then(function (privateIp) {
    return sendUpnpRequest(privateIp, internalPort, externalPort);
  }).then(function (response) {
    // If we received a UPnP response, assume it succeeded
    // or the port is already open
    // TODO(kennysong): Can there be an error response here?
    return externalPort;
  }).catch(function (err) {
    console.log("UPnP failed at: " + err.message);  // Log details of where UPnP timed out
    return -1;
  });
};

/**
* Probe if UPnP AddPortMapping is supported by the router
* @public
* @method probeUpnpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probeUpnpSupport = function () {
  return this.openPortWithUpnp(55557, 55557).then(function (externalPort) {
    if (externalPort !== -1) { return true; }
    return false;
  });
};

// TODO(kennysong): Handle multiple UPnP SSDP responses
/**
* Send a UPnP AddPortMapping request to the router to open/map a port
* @private
* @method sendUpnpRequest
* @param {string} privateIp The private IP address of the user's computer
* @param {string} internalPort The internal port on the computer to map to
* @param {string} externalPort The external port on the router to map to
* @return {Promise<string>} A promise that fulfills with the UPnP response string, or rejects on timeout
*/
PortControl.prototype.sendUpnpRequest = function (privateIp, internalPort, externalPort) {
  var sendSsdpRequest = this.sendSsdpRequest.bind(this);
  var sendAddPortMapping = this.sendAddPortMapping.bind(this);
  var fetchControlUrl = this.fetchControlUrl.bind(this);

  return new Promise(function (F, R) {
    sendSsdpRequest(privateIp).
        then(fetchControlUrl).
        then(function (controlUrl) {
          return sendAddPortMapping(controlUrl, privateIp, internalPort, externalPort);
        }).
        then(function (result) { F(result); }).
        catch(function (err) { R(err); });
  });
};

/**
* Send a UPnP SSDP request on the network and wait for a response
* @private
* @method sendSsdpRequest
* @param {string} privateIp The private IP address of the user's computer
* @return {Promise<ArrayBuffer>} A promise that fulfills with a SSDP response, or rejects on timeout
*/
PortControl.prototype.sendSsdpRequest = function (privateIp) {
  var socket;
  var closeSocket = this.closeSocket;
  var _sendSsdpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout or invalid parsing)
    socket.on('onData', function (ssdpResponse) {
      closeSocket(socket);
      F(ssdpResponse.data);
    });

    // Bind a socket and send the SSDP request
    socket.bind(privateIp, 0).then(function (result) {
      // Construct and send a UPnP SSDP message
      var ssdpStr = 'M-SEARCH * HTTP/1.1\r\n' +
                    'HOST: 239.255.255.250:1900\r\n' +
                    'MAN: ssdp:discover\r\n' +
                    'MX: 10\r\n' +
                    'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1';
      // TODO(kennysong): Use the arraybuffers module?
      // var ssdpBuffer = arraybuffers.stringToArrayBuffer(ssdpStr);
      var ssdpBuffer = this.stringToArrayBuffer(ssdpStr);
      socket.sendTo(ssdpBuffer, '239.255.255.250', 1900);
    });
  });

  // Give _sendSsdpRequest 1 second before timing out
  return Promise.race([
    this.countdownReject(1000, 'SSDP time out', function () {
      closeSocket(socket);
    }),
    _sendSsdpRequest
  ]);
};

/**
 * Fetch the control URL from the information provided in the SSDP response
 * @private
 * @method fetchControlUrl
 * @param {ArrayBuffer} ssdpResponse The ArrayBuffer response to the SSDP message
 * @return {string} The string of the control URL for the router
 */
PortControl.prototype.fetchControlUrl = function (ssdpResponse) {
  var _fetchControlUrl = new Promise(function (F, R) {
    // Get UPnP device profile URL from the LOCATION header
    // TODO(kennysong): Use arraybuffers module?
    var ssdpStr = this.arrayBufferToString(ssdpResponse);
    var startIndex = ssdpStr.indexOf('LOCATION: ') + 10;
    var endIndex = ssdpStr.indexOf('\n', startIndex);
    var locationUrl = ssdpStr.substring(startIndex, endIndex);

    // Reject if there is no LOCATION header
    if (startIndex === -1) {
      R(new Error('No LOCATION header for UPnP device'));
    }

    // Get the XML device description at location URL
    var xhr = new XMLHttpRequest();
    xhr.open('GET', locationUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        // Get control URL from XML file
        // (Ideally we would parse and traverse the XML tree,
        // but DOMParser is not available here)
        var xmlDoc = xhr.responseText;
        var preIndex = xmlDoc.indexOf('WANIPConnection');
        var startIndex = xmlDoc.indexOf('<controlURL>', preIndex) + 13;
        var endIndex = xmlDoc.indexOf('</controlURL>', startIndex);

        // Reject if there is no controlUrl
        if (preIndex === -1 || startIndex === 12) {
          R(new Error('Could not parse control URL'));
        }

        // Combine the controlUrl path with the locationUrl
        var controlUrlPath = xmlDoc.substring(startIndex, endIndex);
        var locationUrlParser = new URL(locationUrl);
        var controlUrl = 'http://' + locationUrlParser.host +
                         '/' + controlUrlPath;

        F(controlUrl);
      }
    };
    xhr.send();
  });

  // Give _fetchControlUrl 1 second before timing out
  return Promise.race([
    this.countdownReject(1000, 'Time out when retrieving description XML'),
    _fetchControlUrl
  ]);
};

/**
 * Actually send the AddPortMapping request to the router's control URL
 * @private
 * @method sendAddPortMapping
 * @param {string} controlUrl The control URL of the router
 * @param {string} privateIp The private IP address of the user's computer
 * @param {string} internalPort The internal port on the computer to map to
 * @param {string} externalPort The external port on the router to map to
 * @return {string} The response string to the AddPortMapping request
 */
PortControl.prototype.sendAddPortMapping = function (controlUrl, privateIp, internalPort, externalPort) {
  var _sendAddPortMapping = new Promise(function (F, R) {
    var leaseDuration = 120;  // Note: Some routers may not support a non-zero duration

    // Create the AddPortMapping SOAP request string
    var apm = '<?xml version="1.0"?>' +
              '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
               '<s:Body>' +
                  '<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">' +
                     '<NewExternalPort>' + externalPort + '</NewExternalPort>' +
                     '<NewProtocol>UDP</NewProtocol>' +
                     '<NewInternalPort>' + internalPort + '</NewInternalPort>' +
                     '<NewInternalClient>' + privateIp + '</NewInternalClient>' +
                     '<NewEnabled>1</NewEnabled>' +
                     '<NewPortMappingDescription>uProxy UPnP probe</NewPortMappingDescription>' +
                     '<NewLeaseDuration>' + leaseDuration + '</NewLeaseDuration>' +
                  '</u:AddPortMapping>' +
                '</s:Body>' +
              '</s:Envelope>';

    // Create an XMLHttpRequest that encapsulates the SOAP string
    var xhr = new XMLHttpRequest();
    xhr.open('POST', controlUrl, true);
    xhr.setRequestHeader('Content-Type', 'text/xml');
    xhr.setRequestHeader('SOAPAction', '"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping"');

    // Send the AddPortMapping request
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) { F(xhr.responseText); }
    };
    xhr.send(apm);
  });

  // Give _sendAddPortMapping 1 second to run before timing out
  return Promise.race([
    this.countdownReject(1000, 'AddPortMapping time out'),
    _sendAddPortMapping
  ]);
};

/**
* Return the private IP address of the computer
* @public
* @method getPrivateIp
* @return {Promise<string>} A promise that fulfills with the IP address, or rejects on timeout
*/
PortControl.prototype.getPrivateIp = function () {
  var _getPrivateIp = new Promise(function (F, R) {
    var pc = freedom['core.rtcpeerconnection']({
      iceServers: [
        {urls: ['stun:stun.l.google.com:19302']},
        {urls: ['stun:stun1.l.google.com:19302']},
        {urls: ['stun:stun2.l.google.com:19302']},
        {urls: ['stun:stun3.l.google.com:19302']},
        {urls: ['stun:stun4.l.google.com:19302']},
        {urls: ['stun:stun.services.mozilla.com']},
        {urls: ['stun:stun.stunprotocol.org']}
      ]
    });

    // One of the ICE candidates is the internal host IP; return it
    pc.on('onicecandidate', function (candidate) {
      if (candidate.candidate) {
        var cand = candidate.candidate.candidate.split(' ');
        if (cand[7] === 'host') {
          var internalIp = cand[4];
          // TODO(kennysong): Use ipaddr.js here
          // if (ipaddr.IPv4.isValid(internalIp)) {
          if (internalIp.match(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/).length > 0) {
            F(internalIp);
          }
        }
      }
    });

    // Set up the PeerConnection to start generating ICE candidates
    pc.createDataChannel('dummy data channel').
        then(pc.createOffer).
        then(pc.setLocalDescription);
  });

  // Give _getPrivateIp 2 seconds to run before timing out
  return Promise.race([
    this.countdownReject(2000, 'getPrivateIp() failed'),
    _getPrivateIp
  ]);
};

/**
* Return a promise that rejects in a given time with an Error message,
* and can call a callback function before rejecting
* @private
* @method countdownReject
* @param {number} time Time in seconds
* @param {number} msg Message to encapsulate in the rejected Error
* @param {function} callback Function to call before rejecting
* @return {Promise} A promise that will reject in the given time
*/
PortControl.prototype.countdownReject = function (time, msg, callback) {
  return new Promise(function (F, R) {
    setTimeout(function () {
      if (callback !== undefined) { callback(); }
      R(new Error(msg));
    }, time);
  });
};

/**
* Close the OS-level sockets and discard its Freedom object
* @private
* @method closeSocket
* @param {freedom_UdpSocket.Socket} socket The socket object to close
*/
PortControl.prototype.closeSocket = function (socket) {
  socket.destroy().then(function () {
    freedom['core.udpsocket'].close(socket);
  });
};

/**
* Return a random integer in a specified range
* @private
* @method randInt
* @param {number} min Lower bound for the random integer
* @param {number} max Upper bound for the random integer
* @return {number} A random number between min and max
*/
PortControl.prototype.randInt = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
* Convert an ArrayBuffer to a UTF-8 string
* @private
* @method arrayBufferToString
* @param {ArrayBuffer} buffer ArrayBuffer to convert
* @return {string} A string converted from the ArrayBuffer
*/
function arrayBufferToString(buffer) {
    var bytes = new Uint8Array(buffer);
    var a = [];
    for (var i = 0; i < bytes.length; ++i) {
        a.push(String.fromCharCode(bytes[i]));
    }
    return a.join('');
}

/**
* Convert a UTF-8 string to an ArrayBuffer
* @private
* @method stringToArrayBuffer
* @param {string} s String to convert
* @return {ArrayBuffer} An ArrayBuffer containing the string data
*/
function stringToArrayBuffer(s) {
    var buffer = new ArrayBuffer(s.length);
    var bytes = new Uint8Array(buffer);
    for (var i = 0; i < s.length; ++i) {
        bytes[i] = s.charCodeAt(i);
    }
    return buffer;
}

if (typeof freedom !== 'undefined') {
  freedom().providePromises(PortControl);
}
