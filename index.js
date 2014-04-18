/*jslint node: true */
'use strict';

/**
* Module dependencies
*/

var Resource = require('deployd/lib/resource'),
Session = require('deployd/lib/session'),
util = require('util'),
formidable = require('formidable'),
fs = require('fs'),
path = require('path'),
knox = require('knox'),
gm = require('gm')
;

/**
* Module setup.
*/

function ImageWrangler( name, options ) {
	Resource.apply( this, arguments );
	if (this.config.accessKey && this.config.accessSecret && this.config.bucket) {
		this.client = knox.createClient({
			key: this.config.accessKey,
			secret: this.config.accessSecret,
			bucket: this.config.bucket,
			region: this.config.region
		});
	}


}
util.inherits( ImageWrangler, Resource );

ImageWrangler.prototype.clientGeneration = true;

ImageWrangler.events = ['post'];

ImageWrangler.basicDashboard = {
	settings: [
		{
			name        : 'accessKey',
			type        : 'text',
			description : 'The AWS access key id'
		}, {
			name        : 'accessSecret',
			type        : 'text',
			description : 'The AWS secret access key'
		}, {
			name        : 'region',
			type        : 'text',
			description : 'The AWS region'
		}, {
			name        : 'tasks',
			type        : 'object',
			description : 'JSON array of objects detailing the image specs to be created for each image uploaded to this endpoint'
		}, {
			name        : 'bucket',
			type        : 'text',
		}, {
			name        : 'basePath',
			type        : 'text',
			description : 'base url for where someone could GET the file off the bucket (cloud front url if you are using that)'
		}, {
			name        : 'publicRead',
			type        : 'checkbox',
			description : 'when files are uploaded to your bucket, automatically set public read access?'
		}, {
			name        : 'internalOnly',
			type        : 'checkbox',
			description : 'Only allow internal scripts to send email'
		}, {
			name        : 'imageQuality',
			type        : 'text',
			description : '0-100 (default 95)'
		}, {
			name        : 'crop',
			type        : 'checkbox',
			description : 'center crop image if necessary'
		}
	]
};

/**
* Module methodes
*/

ImageWrangler.prototype.handle = function ( ctx, next ) {
	var req = ctx.req;
	var domain = {url: ctx.url};
	var wrangler = this;
	var parts = ctx.url.split('/').filter(function(p) { return p; });
	var subDirPath = '';
	if (parts.length > 0) subDirPath = parts.join('/');
	if (!this.config.basePath)this.config.basePath = '';

	if ( !ctx.req.internal && this.config.internalOnly ) {
		return ctx.done({ statusCode: 403, message: 'Forbidden' });
	}

	var resizeTasks = JSON.parse(this.config.tasks);

	if (req.method === 'POST' && !req.internal && req.headers['content-type'].indexOf('multipart/form-data') === 0) {
		var form = new formidable.IncomingForm();
		var remaining = 0;
		var files = [];
		var error;
		var lastFile;

		var responseObject = {};
		var cleanseFilename = function(incomingFilename){
			console.log("incoming filename: "+incomingFilename);
			var filename = incomingFilename;
			var extension = null;
			if(incomingFilename.indexOf('.') != -1){
				var pieces = incomingFilename.split('.');
				extension = pieces.pop();
				filename = pieces.join('.');
			}
			console.log("filename: "+filename);
			console.log('extension: '+extension);
			filename = filename.replace(/\s+/g, '-').toLowerCase(); //converst space to dash
			console.log('replaced spaces with dashes: '+filename);
			filename = filename.replace(/[^a-z0-9_\-]/gi, ''); // drop all other funny business
			console.log('dropped bad characters: '+filename);
			if(extension){
				console.log('completed result: '+filename+'.'+extension);
				return filename+'.'+extension;
			}
			return filename;
		};
		var resizeFile = function(){
			if (resizeTasks.length>0) {
				var task = resizeTasks.pop();
				console.log('task: '+JSON.stringify(task));

				var output = cleanseFilename(lastFile.name).split('.');
				var outputName = output[0]+'-'+task.suffix+'.'+output[1];
				output = lastFile.path.split('/');
				output.pop();
				var outputPath = output.join('/')+'/'+outputName;
				var quality = 95;
				if(wrangler.config.imageQuality){
					quality = wrangler.config.imageQuality;
				}
				var completionBlock = function (err) {
					if (!err) {
						responseObject[task.suffix] = wrangler.config.basePath+subDirPath+'/'+outputName;
						var stat = fs.statSync(outputPath);
						wrangler.uploadFile('/'+subDirPath+'/'+outputName, stat.size, lastFile.type, fs.createReadStream(outputPath), resizeFile);
					}else{
						console.log(' error writing: '+err);
						ctx.done(err);
					}
				};
				if (wrangler.config.crop) {
					gm(lastFile.path)
					.quality(quality)
					.autoOrient()
					.resize(task.width, task.height, '^')
					.gravity('Center')
					.extent(task.width, task.height)
					.write(outputPath, completionBlock);
				}else{
					gm(lastFile.path)
					.quality(quality)
					.autoOrient()
					.resize(task.width, task.height)
					.write(outputPath, completionBlock);
				}
			}else{
				if (req.headers.referer) {
					ctx.done(null, responseObject);
				} else {
					ctx.done(null, files);
				}
			}
		};

		form.parse(req)
		.on('file', function(name, file) {
			remaining++;
			lastFile = file;
			//write original version to s3 for safe keeping
			var output = cleanseFilename(file.name).split('.');
			var outputName = output[0]+'-original.'+output[1];
			wrangler.uploadFile('/'+subDirPath+'/'+outputName, file.size, lastFile.type, fs.createReadStream(file.path), resizeFile);
		})
		.on('error', function(err) {
			ctx.done(err);
			error = err;
		});
		req.resume();
		return;
	}

	next();
};

ImageWrangler.prototype.uploadFile = function(filename, filesize, mime, stream, fn) {
	var bucket = this;
	console.log('filename:'+filename);
	console.log('fileSize:'+filesize);
	console.log('mime:'+mime);
	var headers = {
		'Content-Length': filesize,
		'Content-Type': mime
	};
	if(this.config.publicRead){
		headers['x-amz-acl'] = 'public-read';
	}
	//, 'x-amz-acl': 'public-read'
	this.client.putStream(stream, filename, headers, function(err, res) {
		console.log('res: '+res.statusCode);
		if (err){
			fn(err);
		}else{
			if (res.statusCode !== 200) {
				bucket.readStream(res, function(err, message) {
					fn(err || message);
				});
			} else {
				fn();
			}
		}
	});
};

ImageWrangler.prototype.readStream = function(stream, fn) {
  var buffer = '';
  stream.on('data', function(data) {
    buffer += data;
  }).on('end', function() {
    fn(null, buffer);
  }).on('error', function(err) {
    fn(err);
  });
};

/**
* Module export
*/

module.exports = ImageWrangler;
