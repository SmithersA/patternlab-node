/* 
 * patternlab-node - v0.1.2 - 2014-06-21 
 * 
 * Brian Muenzenmeyer, and the web community.
 * Licensed under the MIT license. 
 * 
 * Many thanks to Brad Frost and Dave Olsen for inspiration, encouragement, and advice. 
 *
 */

var patternlab_engine = function(grunt){
	var path = require('path'),
		mustache = require('mustache'),
		of = require('./object_factory'),
		pa = require('./pattern_assembler'),
		patternlab = {};

	patternlab.package = grunt.file.readJSON('package.json');

	function getVersion() {
		grunt.log.ok(patternlab.package.version);
	}

	function help(){
		grunt.log.ok('patternlab help coming soon');
	}

	function printDebug() {
		//debug file can be written by setting flag on package.json
		if(patternlab.package.debug){
			var outputFilename = './patternlab.json';
			grunt.file.write(outputFilename, JSON.stringify(patternlab, null, 3));
		}
	}

	function buildPatterns(){
		patternlab.data = grunt.file.readJSON('./source/_data/data.json');
		patternlab.listitems = grunt.file.readJSON('./source/_data/listitems.json');
		patternlab.header = grunt.file.read('./source/_patternlab-files/pattern-header-footer/header.html');
		patternlab.footer = grunt.file.read('./source/_patternlab-files/pattern-header-footer/footer.html');
		patternlab.patterns = [];
		patternlab.patternIndex = [];
		patternlab.partials = {};

		grunt.file.recurse('./source/_patterns', function(abspath, rootdir, subdir, filename){
			//check if the pattern already exists.  
			var patternName = filename.substring(0, filename.indexOf('.'));
			var patternIndex = patternlab.patternIndex.indexOf(subdir + '-' +  patternName);
			var currentPattern;
			var flatPatternPath;

			//ignore _underscored patterns
			if(filename.charAt(0) === '_'){
				return;
			}

			//two reasons could return no pattern, 1) just a bare mustache, or 2) a json found before the mustache
			//returns -1 if patterns does not exist, otherwise returns the index
			//add the pattern array if first time, otherwise pull it up
			if(patternIndex === -1){
				grunt.verbose.ok('pattern not found, adding to array');
				var flatPatternName = subdir.replace(/\//g, '-') + '-' + patternName;
				flatPatternName = flatPatternName.replace(/\//g, '-');
				currentPattern = new of.oPattern(flatPatternName, subdir, filename, {});
				currentPattern.patternName = patternName.substring(patternName.indexOf('-') + 1);

				if(grunt.util._.str.include(filename, 'json')){
					grunt.verbose.ok('json file found first, so add it to the pattern and continuing');
					currentPattern.data = grunt.file.readJSON(abspath);
					//done
				} else{
					grunt.verbose.ok('mustache file found, assume no data, so compile it right away');
					currentPattern.template = grunt.file.read(abspath);

					//render the pattern. pass partials object just in case.
					currentPattern.patternPartial = mustache.render(currentPattern.template, patternlab.data, patternlab.partials);

					//write the compiled template to the public patterns directory
					flatPatternPath = currentPattern.name + '/' + currentPattern.name + '.html';

					//add footer info before writing
					var currentPatternFooter = mustache.render(patternlab.footer, currentPattern);

					grunt.file.write('./public/patterns/' + flatPatternPath, patternlab.header + currentPattern.patternPartial + currentPatternFooter);
					currentPattern.patternLink = flatPatternPath;

					//add as a partial in case this is referenced later.  convert to syntax needed by existing patterns
					var sub = subdir.substring(subdir.indexOf('-') + 1);
					var folderIndex = sub.indexOf('/'); //THIS IS MOST LIKELY WINDOWS ONLY.  path.sep not working yet
					var cleanSub = sub.substring(0, folderIndex);

					//add any templates found to an object of partials, so downstream templates may use them too
					//exclude the template patterns - we don't need them as partials because pages will just swap data
					if(cleanSub !== ''){
						var partialname = cleanSub + '-' + patternName.substring(patternName.indexOf('-') + 1);

						patternlab.partials[partialname] = currentPattern.template;

						//done		
					}
				}
				//add to patternlab arrays so we can look these up later.  this could probably just be an object.
				patternlab.patternIndex.push(currentPattern.name);
				patternlab.patterns.push(currentPattern);
			} else{
				//if we get here, we can almost ensure we found the json first, so render the template and pass in the unique json
				currentPattern = patternlab.patterns[patternIndex];
				grunt.verbose.ok('pattern found, loaded');
				//determine if this file is data or pattern
				if(grunt.util._.str.include(filename, 'mustache')){

					currentPattern.template = grunt.file.read(abspath);

					//render the pattern. pass partials object just in case.
					currentPattern.patternPartial = mustache.render(currentPattern.template, currentPattern.data, patternlab.partials);
					grunt.verbose.ok('template compiled with data!');

					//write the compiled template to the public patterns directory
					flatPatternPath = currentPattern.name + '/' + currentPattern.name + '.html';

					//add footer info before writing
					var currentPatternFooter = mustache.render(patternlab.footer, currentPattern);

					grunt.file.write('./public/patterns/' + flatPatternPath, patternlab.header + currentPattern.patternPartial + currentPatternFooter);

					currentPattern.patternLink = flatPatternPath;

					//done
				} else{
					grunt.log.error('json encountered!? there should only be one');
				}
			}

		});

	}

	function buildFrontEnd(){
		patternlab.buckets = [];
		patternlab.bucketIndex = [];
		patternlab.patternPaths = {};
		patternlab.viewAllPaths = {};

		//build the styleguide
		var styleguideTemplate = grunt.file.read('./source/_patternlab-files/styleguide.mustache');
		var styleguideHtml = mustache.render(styleguideTemplate, {partials: patternlab.patterns});
		grunt.file.write('./public/styleguide/html/styleguide.html', styleguideHtml);

		//build the patternlab website
		var patternlabSiteTemplate = grunt.file.read('./source/_patternlab-files/index.mustache');
		
		//loop through all patterns.  deciding to do this separate from the recursion, even at a performance hit, to attempt to separate the tasks of styleguide creation versus site menu creation
		for(var i = 0; i < patternlab.patterns.length; i++){
			var pattern = patternlab.patterns[i];
			var bucketName = pattern.name.replace(/\//g, '-').split('-')[1];

			//check if the bucket already exists
			var bucketIndex = patternlab.bucketIndex.indexOf(bucketName);
			if(bucketIndex === -1){
				//add the bucket
				var bucket = new of.oBucket(bucketName);

				//add paternPath
				patternlab.patternPaths[bucketName] = {};

				//get the navItem
				var navItemName = pattern.subdir.split('-').pop();

				//get the navSubItem
				var navSubItemName = pattern.patternName.replace(/-/g, ' ');

				//grunt.log.writeln('new bucket found: ' + bucketName + " " + navItemName + " " + navSubItemName);

				//test whether the pattern struture is flat or not - usually due to a template or page
				var flatPatternItem = false;
				if(navItemName === bucketName){
					flatPatternItem = true;
				}

				//assume the navItem does not exist.
				var navItem = new of.oNavItem(navItemName);

				//assume the navSubItem does not exist.
				var navSubItem = new of.oNavSubItem(navSubItemName);
				navSubItem.patternPath = pattern.patternLink;
				navSubItem.patternPartial = bucketName + "-" + pattern.patternName; //add the hyphenated name

				//if it is flat - we should not add the pattern to patternPaths
				if(flatPatternItem){
					
					bucket.patternItems.push(navSubItem);
					
					//add to patternPaths
					patternlab.patternPaths[bucketName][pattern.patternName] = pattern.subdir + "/" + pattern.filename.substring(0, pattern.filename.indexOf('.'));

				} else{

					bucket.navItems.push(navItem);
					bucket.navItemsIndex.push(navItemName);
					navItem.navSubItems.push(navSubItem);
					navItem.navSubItemsIndex.push(navSubItemName);

					//add to patternPaths
					patternlab.patternPaths[bucketName][pattern.patternName] = pattern.subdir + "/" + pattern.filename.substring(0, pattern.filename.indexOf('.'));

				}

				//add the bucket.
				patternlab.buckets.push(bucket);
				patternlab.bucketIndex.push(bucketName);

				//done

			} else{
				//find the bucket
				var bucket = patternlab.buckets[bucketIndex];

				//get the navItem
				var navItemName = pattern.subdir.split('-').pop();

				//get the navSubItem
				var navSubItemName = pattern.patternName.replace(/-/g, ' ');

				//assume the navSubItem does not exist.
				var navSubItem = new of.oNavSubItem(navSubItemName);
				navSubItem.patternPath = pattern.patternLink;
				navSubItem.patternPartial = bucketName + "-" + pattern.patternName; //add the hyphenated name

				//test whether the pattern struture is flat or not - usually due to a template or page
				var flatPatternItem = false;
				if(navItemName === bucketName){
					flatPatternItem = true;
				}

				//if it is flat - we should not add the pattern to patternPaths
				if(flatPatternItem){

					//add the navItem to patternItems
					bucket.patternItems.push(navSubItem);

					//add to patternPaths
					patternlab.patternPaths[bucketName][pattern.patternName] = pattern.subdir + "/" + pattern.filename.substring(0, pattern.filename.indexOf('.'));

				} else{
					//check to see if navItem exists
					var navItemIndex = bucket.navItemsIndex.indexOf(navItemName);
					if(navItemIndex === -1){

						var navItem = new of.oNavItem(navItemName);

						//add the navItem and navSubItem
						navItem.navSubItems.push(navSubItem);
						navItem.navSubItemsIndex.push(navSubItemName);
						bucket.navItems.push(navItem);
						bucket.navItemsIndex.push(navItemName);

					} else{
						//add the navSubItem
						var navItem = bucket.navItems[navItemIndex];
						navItem.navSubItems.push(navSubItem);
						navItem.navSubItemsIndex.push(navSubItemName);
					}

					// just add to patternPaths
					patternlab.patternPaths[bucketName][pattern.patternName] = pattern.subdir + "/" + pattern.filename.substring(0, pattern.filename.indexOf('.'));

				}

			}

		};

		//the patternlab site requires a lot of partials to be rendered.
		//patternNav
		var patternNavTemplate = grunt.file.read('./source/_patternlab-files/partials/patternNav.mustache');
		var patternNavPartialHtml = mustache.render(patternNavTemplate, patternlab);

		//ishControls
		var ishControlsTemplate = grunt.file.read('./source/_patternlab-files/partials/ishControls.mustache');
		var ishControlsPartialHtml = mustache.render(ishControlsTemplate);

		//patternPaths
		var patternPathsTemplate = grunt.file.read('./source/_patternlab-files/partials/patternPaths.mustache');
		var patternPathsPartialHtml = mustache.render(patternPathsTemplate, {'patternPaths': JSON.stringify(patternlab.patternPaths)});

		//viewAllPaths
		var viewAllPathsTemplate = grunt.file.read('./source/_patternlab-files/partials/viewAllPaths.mustache');
		var viewAllPathersPartialHtml = mustache.render(viewAllPathsTemplate, {'viewallpaths': JSON.stringify(patternlab.viewAllPaths)});

		//websockets
		var websocketsTemplate = grunt.file.read('./source/_patternlab-files/partials/websockets.mustache');
		var config = grunt.file.readJSON('./config/config.json');
		patternlab.contentsyncport = config.contentSyncPort;
		patternlab.navsyncport = config.navSyncPort;

		var websocketsPartialHtml = mustache.render(websocketsTemplate, patternlab);

		//render the patternlab template, with all partials
		var patternlabSiteHtml = mustache.render(patternlabSiteTemplate, {}, {
			'ishControls': ishControlsPartialHtml,
			'patternNav': patternNavPartialHtml,
			'patternPaths': patternPathsPartialHtml,
			'websockets': websocketsPartialHtml,
			'viewAllPaths': viewAllPathersPartialHtml
		});
		grunt.file.write('./public/index.html', patternlabSiteHtml);

	}

	return {
		version: function(){
			return getVersion();
		},
		build: function(){
			buildPatterns();
			buildFrontEnd();
			printDebug();

		},
		help: function(){
			help();
		},
		build_patterns_only: function(){
			grunt.log.ok('only_patterns argument not yet implemented');
			buildPatterns();
			printDebug();
		}
	};

};

module.exports = patternlab_engine;

module.exports = function(grunt) {
	grunt.registerTask('patternlab', 'create design systems with atomic design', function(arg) {

		var patternlab = patternlab_engine(grunt);

		if(arguments.length === 0){
			patternlab.build();
		}

		if(arg && arg === 'v'){
			patternlab.version();
		}

		if(arg && arg === "only_patterns"){
			patternlab.build_patterns_only();
		}

		if(arg && arg === "help"){
			patternlab.help();
		}

		if(arg && (arg !== "v" && arg !=="only_patterns")){
			patternlab.help();
		}

	});

};