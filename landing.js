'use strict';
// Share links made before the app moved to app/ point at this page (".../#b=..."). Forward them to the app
// with the hash intact; every other visit, including the #features and #how anchors, stays on the landing page.
(function () {
    if (/^#b=/.test(location.hash)) location.replace('app/' + location.search + location.hash);
})();
