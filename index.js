"use strict";

// insert node modules here
const response = require("./response");
const request = require("request");
const icommTokenUrl ='https://uaa.dev.apps.cs.sgp.dbs.com/oauth/token?grant_type=client_credentials';
const icommEmailHost = 'https://x01bcapigw1a.uat.dbs.com:10443/api/sg/v1/utilities/internal/notification';
                              
var accessToken='';

// main method
exports.handler = async (event, context, callback) => {
  try {
    getAccessToken();
    if(accessToken !== ""){
      console.log("Started Sending Email...");
      sendEmail(accessToken);
    }
  } catch (e) {
    console.log("Data import failed due to the error ::" + e);
   // response.error(callback, response.status.INTERNAL_SERVER_ERROR, e.message);
  }
};

function getAccessToken() {
  try {
    return new Promise((resolve, reject) => {
     
      request(
        {
          url: icommTokenUrl,
          method: "POST",
          headers: {
            "Content-Type": "application/json"              
          },
          auth: {
            username: 'uat-icomm-hotels',
            password: 'EvMd8YcC3m6bxjYCc4wvXReTbeV0YEx8'
          },
          json: true
        },
        (err, response) => {
          if (err) {
            console.log(
              " Error while Fetching the Token - " +err
            );
            reject(err);
          }
          if(response){
            console.log('received Response...');
            accessToken=response.access_token;
            console.log('Access Token is ::'+accessToken);
          }
          resolve(response);
        }
      );
    });
  } catch (e) {
    console.log("Error in getAccessToken" + e);
  }
}


function sendEmail(accessToken) {
  try {
    return new Promise((resolve, reject) => {
     
      request(
        {
          url: icommEmailHost,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "clientId":"ee578065-eef8-4f5b-82af-d512ab24c691",
            "Authorization":"Bearer "+accessToken
          },
          json: true
        },
        (err, response) => {
          if (err) {
            console.log(
              " Error while Sending the Email - " +err
            );
            reject(err);
          }
          console.log('Email Sent...');
          resolve(response);
        }
      );
    });
  } catch (e) {
    console.log("Error in sendEmail" + e);
  }
}

