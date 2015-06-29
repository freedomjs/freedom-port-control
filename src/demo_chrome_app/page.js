function start(instance) {
  console.log('Freedom and port-control loaded. In start().');
  var portControl = instance();

  document.getElementById('test-IP').addEventListener('click', function () {
    portControl.getPrivateIps().then(function (privateIp) {
      document.getElementById('result-IP').innerText = "Your private IP addresses are: " + privateIp;
    }).catch(function (err) {
      document.getElementById('result-IP').innerText = err.message;
    });
  });

  document.getElementById('test-PMP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-PMP').value;
    var extPort = document.getElementById('external-port-PMP').value;
    portControl.openPortWithPmp(intPort, extPort, false).then(function (extPort) {
      if (extPort !== -1) {
        document.getElementById('result-PMP').innerText =
            "NAT-PMP mapped internal port " + intPort +
            " to external port " + extPort;
      } else {
        document.getElementById('result-PMP').innerText = "NAT-PMP failure.";
      }
    });
  });

  document.getElementById('test-PCP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-PCP').value;
    var extPort = document.getElementById('external-port-PCP').value;
    portControl.openPortWithPcp(intPort, extPort, false).then(function (extPort) {
      if (extPort !== -1) {
        document.getElementById('result-PCP').innerText =
            "PCP mapped internal port " + intPort +
            " to external port " + extPort;
      } else {
        document.getElementById('result-PCP').innerText = "PCP failure.";
      }
    });
  });

  document.getElementById('test-UPnP').addEventListener('click', function () {
    var intPort = document.getElementById('internal-port-UPnP').value;
    var extPort = document.getElementById('external-port-UPnP').value;
    portControl.openPortWithUpnp(intPort, extPort, false).then(function (extPort) {
      if (extPort !== -1) {
        document.getElementById('result-UPnP').innerText =
            "UPnP mapped internal port " + intPort +
            " to external port " + extPort;
      } else {
        document.getElementById('result-UPnP').innerText = "UPnP failure. (Check console for details)";
      }
    });
  });
}

window.onload = function (port) {
  if (typeof freedom !== 'undefined') {
    freedom('port-control.json').then(start);
  }
}.bind({}, self.port);
