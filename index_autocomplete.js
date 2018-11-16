'use strict';

// insert custom modules here
const AWS = require("aws-sdk");
const config = require('./config');
// const database = require('./database');
const response = require('./response');
const model = require('./model');
const iplocation = require('iplocation');

// insert node modules here
const request = require('request');
const _ = require('lodash');
const Joi = require('joi');
const CryptoJS = require('crypto-js');
const zlib = require('zlib');
const elasticsearch = require("elasticsearch");
const httpawses = require("http-aws-es");

const elasticSearchHost = process.env.ELASTICSEARCH_HOSTNAME || 'https://search-autocompletedataset-5qaz6uyquwhrd5mrghph7rajzu.ap-southeast-1.es.amazonaws.com';
// const elasticSearchHost = 'https://search-autocompletedata-gj7sxmdc3orsrbvsadr64wri2m.ap-southeast-1.es.amazonaws.com';
const esPropertiesIndex = "properties";

exports.handler = async (event, context, callback) => {
	try {
		// get query object
		let query = event.query;

		if (!query) {
			query = {};
		}

		const result = Joi.validate(query, Joi.object().keys(model.searchQuerySchema), { stripUnknown: true });

		if (result.error !== null) {
			response.error(callback, response.status.BAD_REQUEST, result.error.details[0].message.replace(/['"]+/g, ''));
		} else {
			// sanitize query
			let q = truncateString(query.q.toLowerCase().trim(), 40)
					  .replace(/[',;*\-&^%$#@!&()+"?><|~`_=}{[/]]/g, ' ');

			const n = 10;
			const finalN = 10;
			const ip = query.customerIp || '119.74.109.57';

			const responseFromSearch = await search(q, n);
			const results = responseFromSearch.hits.hits;
			const resultsSortedByRelevance = sort(
				results,
				byRelevance,
				byAlphabeticalOrder,
				ip,
				'properties'
			);
			const formattedResults = await formatResponse(
				resultsSortedByRelevance,
				finalN,
				regionsFilter,
				['Hotel']
			);
			const toReturn = {
				search_term: q,
				results_count: formattedResults.length,
				results: formattedResults
			}
			response.success(callback, response.status.SUCCESS, toReturn);
		}
	} catch (e) {
		console.log(e);
		response.error(callback, response.status.INTERNAL_SERVER_ERROR, e.message);
	}
}

const sort = (data, fn1, fn2, ip, typePreference) => {
	return fn2(fn1(data, ip), typePreference);
}

const byAlphabeticalOrder = (data, typePreference) => {
	if (data[0] == undefined) {
		return data;
	}
	if (!typePreference) {
		return _.orderBy(data, [i => i._source.name], ['asc']);
	}
	if (typePreference == 'properties') {
		return _.orderBy(data, [i => i._source.idType, i => i._source.name], ['asc', 'asc']);
	}
	if (typePreference == 'regions') {
		return _.orderBy(data, [i => i._source.idType, i => i._source.name], ['desc', 'desc']);
	}
	return data;
}

const regionsFilter = (data, types) => {
	let passedData = [];
	let acceptedRegionTypes = ['country', 'province_state', 'high_level_region', 'multi_city_vicinity', 'city', 'neighborhood', 'point_of_interest'];
	let acceptedPropertyTypes = types;
	_.each(data, item => {
		// if ((item.idType === 'propertyId' && acceptedPropertyTypes.indexOf('Hotel') != -1) || (item.idType === 'regionId' && acceptedRegionTypes.indexOf(item.type) != -1)) {
		// 	console.log('pushing');
		// 	passedData.push(item);
		// }
		if (item.idType === 'propertyId' || item.idType === 'regionId' && acceptedRegionTypes.indexOf(item.type) != -1) {
			if (item.idType === 'regionId') {
				let word = wordify(item.type);
				item.type = word;
				passedData.push(item);
			} else {
				passedData.push(item);
			}
		}
	})
	return passedData;
}

const byRelevance = (data, ip) => {
	// const locationPromise = getLocationByIP(ip);
	// locationPromise.then( (loc) => { console.log('------> ' + loc) } );
	return data;
}

const formatResponse = (data, n, customFilter, types) => {
	let array = [];
	_.each(data, (item) => { array.push(item._source) });
	
	if (customFilter && !types) {
		return customFilter(array.slice(0, n));
	}
	if (customFilter && types) {
		return customFilter(array.slice(0, n), types);
	}

	return array.slice(0, n);
}

const getLocationByIP = (ip) => {
	return new Promise((resolve, reject) => {
	iplocation(ip, function (error, res) {
		if (error) {
			console.log('error getting location');
		}
		console.log(printJSON(res));
		return resolve(res.country_name.toLowerCase());
	});
});
}

// basic retrieve
const search = (q, n) => {
	let wildCardQuery = '*' + q + '*';
	return new Promise((resolve, reject) => {
		request({
			url: elasticSearchHost + '/_search',
			method: 'GET',
			qs: {
				size: n,
				q: wildCardQuery
			},
			gzip: true
		}, (err, response, body) => {
			if (err) {
				console.log('err: ' + err);
				reject(err);
			}
			let JSONresponse = JSON.parse(body);
			console.log('search results: ' + JSONresponse);
			if (JSONresponse.hits == undefined) {
				resolve({'hits': {'hits': []}});
			} else {
				resolve(JSONresponse);
			}
		});
	});
}

// post retrieve
const searchByPost = (q, n) => {
	let wildCardQuery = '*' + q + '*';
	let body = {
		"size": n,
		"sort": {
			"name": {
				"order": "asc"
			}
		},
		"query": {
			"query_string": {
				"default_field": "name",
				"query": wildCardQuery
			}
		},
		"filter" : {
			"type" : "Hotel"
		},
	};
	return new Promise((resolve, reject) => {
		request({
			url: elasticSearchHost + '/_search',
			method: 'POST',
			qs: {
				size: n,
				q: wildCardQuery
			},
			body: JSON.stringify(body),
			gzip: true
		}, (err, response, body) => {
			if (err) {
				console.log('err: ' + err);
				reject(err);
			}
			let JSONresponse = JSON.parse(body);
			console.log('search results: ' + JSONresponse);
			if (JSONresponse.hits == undefined) {
				resolve({'hits': {'hits': []}});
			} else {
				resolve(JSONresponse);
			}
		});
	});
}

const wordify = (str) => {
	return _.map(str.replace(/[_]/g, ' ').split(' '), i => {
		if ( i != 'of') {
			return _.startCase(i);
		} else {
			return i;
		}
	}).join(' ');
}

const truncateString = (str, maxLength) => {
	return str.substring(0, maxLength);
}

const printJSON = (obj) => {
	console.log(JSON.stringify(obj, null, 2));
}

const returnValues = (obj) => {
	return _.values(obj);
}
