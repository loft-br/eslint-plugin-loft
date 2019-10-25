'use strict';

function log(message) {
  if (!/=-(f|-format)=/.test(process.argv.join('='))) {
    console.log(message);
  }
}

module.exports = log;
