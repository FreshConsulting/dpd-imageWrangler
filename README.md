dpd-imageWrangler
=================

Deployd module that takes an image upload via POST and makes multiple resized versions it, then places them on an AWS s3 bucket

Allows you to customize how many and what sized versions are made through an object set in the configuration panel on the resource.

"tasks": "[ {"width":1200, "height":800, "suffix":"xhdpi"},
			{"width":600, "height":400, "suffix":"mdpi"}
		]"
