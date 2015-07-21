var utils = require('./utils');

/**
* Probe if UPnP AddPortMapping is supported by the router
* @public
* @method probeSupport
* @param {object} activeMappings Table of active Mappings
* @param {Array<string>} routerIpCache Router IPs that have previously worked
* @return {Promise<boolean>} A promise for a boolean
*/
var probeSupport = function (activeMappings) {
  return addMapping(utils.UPNP_PROBE_PORT, utils.UPNP_PROBE_PORT, 120,
                    activeMappings).
      then(function (mapping) { return mapping.externalPort !== -1; });
};

/**
* Makes a port mapping in the NAT with UPnP AddPortMapping
* @public
* @method addMapping
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity; a static AddPortMapping request
* @param {object} activeMappings Table of active Mappings
* @return {Promise<Mapping>} A promise for the port mapping object 
*                               mapping.externalPort is -1 on failure
*/
var addMapping = function (intPort, extPort, lifetime, activeMappings) {
  var mapping = new utils.Mapping();
  mapping.internalPort = intPort;
  mapping.protocol = 'upnp';

  // Does the UPnP flow to send a AddPortMapping request and parse the response
  function _handleUpnpFlow() {
    return doUpnpFlow(intPort, extPort, lifetime).then(function (intIp) {
      // Success response to AddPortMapping (the internal IP of the mapping)
      // The requested external port will always be mapped on success, 
      // and the lifetime will always be the requested lifetime; errors otherwise
      mapping.externalPort = extPort;
      mapping.internalIp = intIp;
      mapping.lifetime = lifetime;
      return mapping;
    }).catch(function (err) {
      // Either timeout, runtime error, or error response to AddPortMapping
      console.log("UPnP failed at: " + err.message);
      return mapping;
    });
  }

  // Save the Mapping object in activeMappings on success, and set a timeout 
  // to delete the mapping on expiration
  // Note: We never refresh for UPnP as the requested lifetime is always
  // the actual lifetime of the mapping, and 0 is infinity per the protocol
  function _saveMapping(mapping) {
    // Delete the entry from activeMapping at expiration
    if (mapping.externalPort !== -1 && lifetime !== 0) {
      setTimeout(function () { delete activeMappings[mapping.externalPort]; },
                 mapping.lifetime*1000);
    }

    // If mapping succeeded, attach a deleter function and add to activeMappings
    if (mapping.externalPort !== -1) {
      mapping.deleter = deleteMapping.bind({}, mapping.externalPort, activeMappings);
      activeMappings[mapping.externalPort] = mapping;
    }
    return mapping;
  }

  // After receiving an AddPortMapping response, set a timeout to delete the 
  // mapping, and add it to activeMappings
  return _handleUpnpFlow().then(_saveMapping);
};

/**
* Deletes a port mapping in the NAT with UPnP DeletePortMapping
* @public
* @method deleteMapping
* @param {number} extPort The external port of the mapping to delete
* @param {object} activeMappings Table of active Mappings
* @return {Promise<boolean>} True on success, false on failure
*/
var deleteMapping = function (extPort, activeMappings) {
  // Does the UPnP flow for deleting a mapping (SSDP, POST to control URL)
  // and if successful, delete its Mapping from activeMappings
  return sendSsdpRequest().then(function (ssdpResponses) {
    // After collecting all the SSDP responses, try to get the
    // control URL field for each response, and return an array
    return Promise.all(ssdpResponses.map(function (ssdpResponse) {
      return fetchControlUrl(ssdpResponse).
          then(function (controlUrl) { return controlUrl; }).
          catch(function (err) { return null; });
    }));
  }).then(function (controlUrls) {
    // Find the first control URL that we received; we use it for DeletePortMapping
    var controlUrl;
    for (var i = 0; i < controlUrls.length; i++) {
      if (controlUrls[i] !== null) {
        controlUrl = controlUrls[i];
        break;
      }
    }
    // Send the DeletePortMapping request
    if (controlUrl !== undefined) {
      return sendDeletePortMapping(controlUrl, extPort);
    } else {
      R(new Error("No UPnP devices have a control URL"));
    }
  }).then(function (result) {
    delete activeMappings[extPort];
    return true;
  }).catch(function (err) {
    return false;
  });
};

/**
* Runs the UPnP procedure for mapping a port 
* (1. SSDP, 2. GET location URL, 3. POST to control URL)
* @private
* @method doUpnpFlow
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
* @return {Promise<string>} A promise that fulfills with the internal IP of the 
*                           mapping, or rejects on timeout.
*/
var doUpnpFlow = function (intPort, extPort, lifetime) {
  var internalIp;

  // Does the UPnP flow for adding a mapping (SSDP, POST to control URL)
  // and if successful, return the internal IP of the mapping
  return new Promise(function (F, R) {
    sendSsdpRequest().then(function (ssdpResponses) {
      // After collecting all the SSDP responses, try to get the
      // control URL field for each response, and return an array
      return Promise.all(ssdpResponses.map(function (ssdpResponse) {
        return fetchControlUrl(ssdpResponse).
            then(function (controlUrl) { return controlUrl; }).
            catch(function (err) { return null; });
      }));
    }).then(function (controlUrls) {
      // Find the first control URL that we received; use it for AddPortMapping
      var routerIp, controlUrl;
      for (var i = 0; i < controlUrls.length; i++) {
        controlUrl = controlUrls[i];
        if (controlUrl !== null) {
          // Parse the router IP from the control URL
          routerIp = (new URL(controlUrl)).hostname;
          break;
        }
      }

      if (routerIp !== undefined) {
        // Get the correct internal IP (if there are multiple network interfaces)
        // for this UPnP router, by doing a longest prefix match, and use it to
        // send an AddPortMapping request
        return utils.getPrivateIps().then(function(privateIps) {
          internalIp = utils.longestPrefixMatch(privateIps, routerIp);

          return sendAddPortMapping(controlUrl, internalIp, intPort, 
                                          extPort, lifetime);
        });
      } else {
        R(new Error("No UPnP devices have a control URL"));
      }
    }).then(function (result) {
      F(internalIp);  // Result is a non-descriptive success message, no need to return
    }).catch(function (err) {
      R(err);
    });
  });
};

/**
* Send a UPnP SSDP request on the network and collects responses
* @private
* @method sendSsdpRequest
* @return {Promise<Array>} A promise that fulfills with an array of SSDP response,
*                          or rejects on timeout
*/
var sendSsdpRequest = function () {
  var ssdpResponses = [];
  var socket = freedom['core.udpsocket']();

  // Fulfill when we get any reply (failure is on timeout or invalid parsing)
  socket.on('onData', function (ssdpResponse) {
    ssdpResponses.push(ssdpResponse.data);
  });

  // Bind a socket and send the SSDP request
  socket.bind('0.0.0.0', 0).then(function (result) {
    // Construct and send a UPnP SSDP message
    var ssdpStr = 'M-SEARCH* HTTP/1.1\r\n' +
                  'HOST: 239.255.255.250:1900\r\n' +
                  'MAN: ssdp:discover\r\n' +
                  'MX: 10\r\n' +
                  'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1';
    var ssdpBuffer = utils.stringToArrayBuffer(ssdpStr);
    socket.sendTo(ssdpBuffer, '239.255.255.250', 1900);
  });

  // Collect SSDP responses for 1 second before timing out
  return new Promise(function (F, R) {
    setTimeout(function () {
      if (ssdpResponses.length > 0) { F(ssdpResponses); }
      else { R(new Error("SSDP timeout")); }
    }, 1000);
  });
};

/**
* Fetch the control URL from the information provided in the SSDP response
* @private
* @method fetchControlUrl
* @param {ArrayBuffer} ssdpResponse The ArrayBuffer response to the SSDP message
* @return {string} The string of the control URL for the router
*/
var fetchControlUrl = function (ssdpResponse) {
  // Parses the location URL from the SSDP response, then send a POST xhr to 
  // the location URL to find the router's UPNP control URL
  var _fetchControlUrl = new Promise(function (F, R) {
    var ssdpStr = utils.arrayBufferToString(ssdpResponse);
    var startIndex = ssdpStr.indexOf('LOCATION:') + 9;
    var endIndex = ssdpStr.indexOf('\n', startIndex);
    var locationUrl = ssdpStr.substring(startIndex, endIndex).trim();

    // Reject if there is no LOCATION header
    if (startIndex === 8) {
      R(new Error('No LOCATION header for UPnP device'));
      return;
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
          return;
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
    utils.countdownReject(1000, 'Time out when retrieving description XML'),
    _fetchControlUrl
  ]);
};

/**
* Send an AddPortMapping request to the router's control URL
* @private
* @method sendAddPortMapping
* @param {string} controlUrl The control URL of the router
* @param {string} privateIp The private IP address of the user's computer
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
* @return {string} The response string to the AddPortMapping request
*/
var sendAddPortMapping = function (controlUrl, privateIp, intPort, extPort, lifetime) {
  // Send an AddPortMapping request to the control URL of the router
  var _sendAddPortMapping = new Promise(function (F, R) {

    // Create the AddPortMapping SOAP request string
    var apm = '<?xml version="1.0"?>' +
              '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
               '<s:Body>' +
                  '<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">' +
                     '<NewExternalPort>' + extPort + '</NewExternalPort>' +
                     '<NewProtocol>UDP</NewProtocol>' +
                     '<NewInternalPort>' + intPort + '</NewInternalPort>' +
                     '<NewInternalClient>' + privateIp + '</NewInternalClient>' +
                     '<NewEnabled>1</NewEnabled>' +
                     '<NewPortMappingDescription>uProxy UPnP</NewPortMappingDescription>' +
                     '<NewLeaseDuration>' + lifetime + '</NewLeaseDuration>' +
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
      if (xhr.readyState === 4 && xhr.status === 200) {
        // Success response to AddPortMapping
        F(xhr.responseText);
      } else if (xhr.readyState === 4 && xhr.status === 500) {
        // Error response to AddPortMapping
        var responseText = xhr.responseText;
        var startIndex = responseText.indexOf('<errorDescription>') + 18;
        var endIndex = responseText.indexOf('</errorDescription>', startIndex);
        var errorDescription = responseText.substring(startIndex, endIndex);
        R(new Error('AddPortMapping Error: ' + errorDescription));
      }
    };
    xhr.send(apm);
  });

  // Give _sendAddPortMapping 1 second to run before timing out
  return Promise.race([
    utils.countdownReject(1000, 'AddPortMapping time out'),
    _sendAddPortMapping
  ]);
};

/**
* Send a DeletePortMapping request to the router's control URL
* @private
* @method sendDeletePortMapping
* @param {string} controlUrl The control URL of the router
* @param {number} extPort The external port of the mapping to delete
* @return {string} The response string to the AddPortMapping request
*/
var sendDeletePortMapping = function (controlUrl, extPort) {
  // Send an AddPortMapping request to the control URL of the router
  var _sendDeletePortMapping = new Promise(function (F, R) {
    // Create the DeletePortMapping SOAP request string
    var apm = '<?xml version="1.0"?>' +
              '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
               '<s:Body>' +
                  '<u:DeletePortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">' +
                     '<NewRemoteHost></NewRemoteHost>' +
                     '<NewExternalPort>' + extPort + '</NewExternalPort>' +
                     '<NewProtocol>UDP</NewProtocol>' +
                  '</u:DeletePortMapping>' +
                '</s:Body>' +
              '</s:Envelope>';

    // Create an XMLHttpRequest that encapsulates the SOAP string
    var xhr = new XMLHttpRequest();
    xhr.open('POST', controlUrl, true);
    xhr.setRequestHeader('Content-Type', 'text/xml');
    xhr.setRequestHeader('SOAPAction', '"urn:schemas-upnp-org:service:WANIPConnection:1#DeletePortMapping"');

    // Send the DeletePortMapping request
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        // Success response to DeletePortMapping
        F(xhr.responseText);
      } else if (xhr.readyState === 4 && xhr.status === 500) {
        // Error response to DeletePortMapping
        // It seems that this almost never errors, even with invalid port numbers
        var responseText = xhr.responseText;
        var startIndex = responseText.indexOf('<errorDescription>') + 18;
        var endIndex = responseText.indexOf('</errorDescription>', startIndex);
        var errorDescription = responseText.substring(startIndex, endIndex);
        R(new Error('DeletePortMapping Error: ' + errorDescription));
      }
    };
    xhr.send(apm);
  });

  // Give _sendDeletePortMapping 1 second to run before timing out
  return Promise.race([
    utils.countdownReject(1000, 'DeletePortMapping time out'),
    _sendDeletePortMapping
  ]);
};

module.exports = {
  probeSupport: probeSupport,
  addMapping: addMapping,
  deleteMapping: deleteMapping
};
