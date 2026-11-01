// Retired: the forms app moved into the merged CRM at /kec-crm/. Clean up and step aside.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf('kf-') === 0; }).map(function(k){ return caches.delete(k); })); })
    .then(function(){ return self.registration.unregister(); })
    .then(function(){ return self.clients.matchAll({type:'window'}); })
    .then(function(cs){ cs.forEach(function(c){ c.navigate(c.url); }); }));
});
