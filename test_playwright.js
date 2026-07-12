const { _electron } = require('playwright');
console.log(_electron ? 'Playwright electron available' : 'Not available');
