var portControl;

function start(instance) {
  console.log('Freedom and port-control loaded. In start().');
  portControl = instance();

  document.getElementById('test-IP').addEventListener('click', function () {
    portControl.getPrivateIps().then(function (privateIp) {
      document.getElementById('result-IP').innerText = "Your private IP addresses are: " + privateIp;
    }).catch(function (err) {
      document.getElementById('result-IP').innerText = err.message;
    });
  });

  document.getElementById('test-protocols').addEventListener('click', function () {
    portControl.probeProtocolSupport().then(function (protocolSupport) {
      document.getElementById('result-protocols').innerText =
          JSON.stringify(protocolSupport, null, 2);
    });
  });

  document.getElementById('add-PMP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-PMP').value;
    var extPort = document.getElementById('external-port-PMP').value;
    portControl.addMappingPmp(intPort, extPort, false).then(function (mappingObj) {
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
    portControl.addMappingPcp(intPort, extPort, false).then(function (mappingObj) {
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
    portControl.addMappingUpnp(intPort, extPort, false).then(function (mappingObj) {
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

  document.getElementById('add-any').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-any').value;
    var extPort = document.getElementById('external-port-any').value;
    portControl.addMapping(intPort, extPort, false).then(function (mappingObj) {
      if (mappingObj.externalPort !== -1) {
        document.getElementById('result-any').innerText =
            JSON.stringify(mappingObj, null, 2);
      } else {
        document.getElementById('result-any').innerText = "All protocols failed.";
      }
    });
  });

  document.getElementById('delete-any').addEventListener('click', function () {
    var extPort = document.getElementById('external-port-any').value;
    portControl.deleteMapping(extPort).then(function (deleteResult) {
      if (deleteResult) {
        document.getElementById('result-any').innerText = "Mapping deleted.";
      } else {
        document.getElementById('result-any').innerText = "Mapping could not be deleted.";
      }
    });
  });
}

window.onload = function (port) {
  if (typeof freedom !== 'undefined') {
    freedom('port-control.json').then(start);
  }
}.bind({}, self.port);
