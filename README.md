# dpd-image-wrangler v0.2.3

Deployd module that takes an image upload via POST and makes multiple resized versions of it, then places them on an AWS s3 bucket

Allows you to customize how many and what sized versions of the uploaded image are made in the config panel of the deployd resource you setup.

## Install

	npm install dpd-image-wrangler

## Configuration

Add a resource in the deployd dashboard selecting dpd-imageWrangler and name your resource. In the config for your new resource, you'll need to supply:

-	AWS Access Key
- 	AWS Secret
-	AWS region
-	AWS S3 bucket name
-	Resize tasks to be done when an image is uploaded (see below)

*additional optional configurations:*

-	Public read access. When files are placed on your S3 bucket, automatically flag them for public read.
-	basePath.  optionally include a base url (like your Cloud Front url) to be inlcuded with the image urls in the repsonse JSON object.
-	Internal only.  Only allow the resource to be accessed from internal deployd requests, and not from general public requests.
-	Image Quality.  (Default: 95) image quality setting, range 0-100
-	Crop.  After scaling image to meet bounding width/height, should it center crop off the excess opposing width/height to ensure dimensions exactly match those defined for the resize task.

## Setting up resize tasks

You can configure multiple resize tasks to be executed on the same resource.  The tasks configuration option expects a string representing a JSON array of objects where each object contains a desired width, height, and suffix string to be appended to the resulting filename.

*example:*

	[
		{"width":1200, "height":800, "suffix":"xhdpi"},
		{"width":600, "height":400, "suffix":"mdpi"}
	]

Unfortuantely in the current build of Deployd (0.6.X) - I haven't figured out a way to actually get the object editor seen in the data editor to pop up for a config setting.  So the resize items must get input as a colapsed JSON string like this:

	[{"width":600, "height":600, "suffix":"xhdpi"},{"width":300, "height":300, "suffix":"mdpi"}]

Not as user friendly as we would like but hopefully we can get that fixed in a future update of deployd. 

## Making a request

Only *POST* methods are currently accepted.  Expects a multipart form style submission (relys on formidable to handle the incoming form submissions) for the file upload.  Simply make the POST request to your defined /[resource] and the resize tasks will execute on your uploaded file.

Making the POST to **/[resource]/additional-name** will place the resulting resized images into folders on your S3 bucket of whatever addition name you specify in the path you posted to.

## Output

If you upload a file named *ImperialStout.jpg* to **/[resource]/beers** with the example tasks configured as above, you would end up with the following on your S3 bucket

-	/beers/ImperialStout-original.jpg
-	/beers/ImperialStout-mdpi.jpg
-	/beers/ImperialStout-xhdpi.jpg

In response to your request, a JSON object will be sent containing the resized image results as key/value pairs

	{
		"mdpi": "/beers/ImperialStout-mdpi.jpg",
		"xhdpi": "/beers/ImperialStout-xhdpi.jpg"
	}

If you specify your S3 bucket url or cloud front url in the config option for basePath the response would be

	{
		"mdpi": "http://d111111abcdef8.cloudfront.net/beers/ImperialStout-mdpi.jpg",
		"xhdpi": "http://d111111abcdef8.cloudfront.net/beers/ImperialStout-xhdpi.jpg"
	}

## About the resize routine

Images will be resized by attmepting a "center cropped aspect fill".  Meaning that the input image will be resized such that it fills the desired rectangle without distorting the image. Typically this means that one of either width or height will extend beyond the desired width/height.  The image is centered and the extra is clipped off.  

The resize is performed by the ["gm" node module](https://github.com/aheckmann/gm)

## TODO's

-	handle multiple files uploaded within a single POST request


