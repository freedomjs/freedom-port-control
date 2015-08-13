var portControl;

function start(instance) {
  console.log('Freedom and port-control loaded. In start().');
  portControl = instance();

  document.getElementById('test-IP').addEventListener('click', function () {
    portControl.getPrivateIps().then(function (privateIps) {
      document.getElementById('result-IP').innerText = "Your private IP addresses are: " +
        JSON.stringify(privateIps, null, 2);
    }).catch(function (err) {
      document.getElementById('result-IP').innerText = err.message;
    });
  });

  document.getElementById('test-router-cache').addEventListener('click', function () {
    portControl.getRouterIpCache().then(function (routerIps) {
      document.getElementById('result-router-cache').innerText = "Your cached router IPs are: " +
        JSON.stringify(routerIps, null, 2);
    }).catch(function (err) {
      document.getElementById('result-router-cache').innerText = err.message;
    });
  });

  document.getElementById('test-protocols').addEventListener('click', function () {
    portControl.probeProtocolSupport().then(function (protocolSupport) {
      document.getElementById('result-protocols').innerText =
          JSON.stringify(protocolSupport, null, 2);
    });
  });

  document.getElementById('mappings').addEventListener('click', function () {
    portControl.getActiveMappings().then(function (activeMappings) {
      document.getElementById('result-mappings').innerText =
          JSON.stringify(activeMappings, null, 2);
    });
  });

  document.getElementById('protocol-support').addEventListener('click', function () {
    portControl.getProtocolSupportCache().then(function (support) {
      document.getElementById('result-protocol-support').innerText =
          JSON.stringify(support, null, 2);
    });
  });

  document.getElementById('add-PMP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-PMP').value;
    var extPort = document.getElementById('external-port-PMP').value;
    var lifetime = document.getElementById('lifetime-PMP').value;
    portControl.addMappingPmp(intPort, extPort, lifetime).then(function (mappingObj) {
      if (mappingObj.externalPort !== -1) {
        document.getElementById('result-PMP').innerText =
            "NAT-PMP mapping object: " + JSON.stringify(mappingObj, null, 2);
      } else {
        document.getElementById('result-PMP').innerText = "NAT-PMP failure.";
      }
    });
  });

  document.getElementById('delete-PMP').addEventListener('click', function () {
    var extPort = document.getElementById('external-port-PMP').value;
    portControl.deleteMappingPmp(extPort).then(function (deleteResult) {
      if (deleteResult) {
        document.getElementById('result-PMP').innerText = "Mapping deleted.";
      } else {
        document.getElementById('result-PMP').innerText = "Mapping could not be deleted.";
      }
    });
  });

  document.getElementById('add-PCP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-PCP').value;
    var extPort = document.getElementById('external-port-PCP').value;
    var lifetime = document.getElementById('lifetime-PCP').value;
    portControl.addMappingPcp(intPort, extPort, lifetime).then(function (mappingObj) {
      if (mappingObj.externalPort !== -1) {
        document.getElementById('result-PCP').innerText =
            "PCP mapping object: " + JSON.stringify(mappingObj, null, 2);
      } else {
        document.getElementById('result-PCP').innerText = "PCP failure.";
      }
    });
  });

  document.getElementById('delete-PCP').addEventListener('click', function () {
    var extPort = document.getElementById('external-port-PCP').value;
    portControl.deleteMappingPcp(extPort).then(function (deleteResult) {
      if (deleteResult) {
        document.getElementById('result-PCP').innerText = "Mapping deleted.";
      } else {
        document.getElementById('result-PCP').innerText = "Mapping could not be deleted.";
      }
    });
  });

  document.getElementById('add-UPnP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-UPnP').value;
    var extPort = document.getElementById('external-port-UPnP').value;
    var lifetime = document.getElementById('lifetime-UPnP').value;
    portControl.addMappingUpnp(intPort, extPort, lifetime).then(function (mappingObj) {
      if (mappingObj.externalPort !== -1) {
        document.getElementById('result-UPnP').innerText =
            "UPnP mapping object: " + JSON.stringify(mappingObj, null, 2);
      } else {
        document.getElementById('result-UPnP').innerText = "UPnP failure. (Check console for details)";
      }
    });
  });

  document.getElementById('delete-UPnP').addEventListener('click', function () {
    var extPort = document.getElementById('external-port-UPnP').value;
    portControl.deleteMappingUpnp(extPort).then(function (deleteResult) {
      if (deleteResult) {
        document.getElementById('result-UPnP').innerText = "Mapping deleted.";
      } else {
        document.getElementById('result-UPnP').innerText = "Mapping could not be deleted.";
      }
    });
  });

  document.getElementById('add-all').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-all').value;
    var extPort = document.getElementById('external-port-all').value;
    var lifetime = document.getElementById('lifetime-all').value;
    portControl.addMapping(intPort, extPort, lifetime).then(function (mappingObj) {
      if (mappingObj.externalPort !== -1) {
        document.getElementById('result-all').innerText =
            JSON.stringify(mappingObj, null, 2);
      } else {
        document.getElementById('result-all').innerText = "All protocols failed.";
      }
    });
  });

  document.getElementById('delete-all').addEventListener('click', function () {
    var extPort = document.getElementById('external-port-all').value;
    portControl.deleteMapping(extPort).then(function (deleteResult) {
      if (deleteResult) {
        document.getElementById('result-all').innerText = "Mapping deleted.";
      } else {
        document.getElementById('result-all').innerText = "Mapping could not be deleted.";
      }
    });
  });
}

window.onload = function (port) {
  if (typeof freedom !== 'undefined') {
    freedom('port-control.json').then(start);
  }
}.bind({}, self.port);
