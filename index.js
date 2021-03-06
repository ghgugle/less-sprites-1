#!/usr/bin/env node

var async = require('async');
var path = require('path');
var util = require('util');
var gm = require('gm');
var im = gm.subClass({ imageMagick: true });
var fs = require('fs');
var Q = require('q');


function Sprites() {
    this.specs = {
        appendRight: false
    };
    this.readArgs();
}

Sprites.prototype.createSprite = function(sourceDir, sourceFiles, destPath, lessPath,  baseUrl, prefix, noCache, border) {
    if ( sourceDir === false) {
        sourceDir = '.'; // default is current directory
    }
    this.sourceDir = sourceDir;

    if( !(sourceFiles && sourceFiles.length > 0) ) {
        if (!fs.existsSync(this.sourceDir)) {
            throw new Error('Source directory "' + this.sourceDir + '" does not exist.');
        }
        var stats = fs.statSync(this.sourceDir);
        if (stats.isDirectory()) {
            sourceFiles = fs.readdirSync(this.sourceDir);
        } else {
            throw new Error('No valid directory was provided.');
        }
    }

    this.destPath = path.resolve(destPath);
    this.lessPath = path.resolve(lessPath);
    this.baseUrl = baseUrl;
    this.prefix = prefix;
    this.noCache = noCache;
    this.borderWidth = border;

    this.files = [];
    this.spriteFile = im();
    this.spriteFile.out('-background', 'none');
    this.spriteFile.out('-bordercolor', 'none');
    this.spriteFile.out('-border', this.borderWidth);

    this.retinaFiles = [];
    this.spriteFileRetina = im();
    this.spriteFileRetina.out('-background', 'none');
    this.spriteFileRetina.out('-bordercolor', 'none');
    this.spriteFileRetina.out('-border', this.borderWidth*2);
    this.retinaDestPath = ( this.destPath.substr(0, ( this.destPath.length - '.png'.length )) + '@2x.png' );

    sourceFiles = this.getSourceFiles(sourceFiles);

    if (!sourceFiles.length) {
        throw new Error('No valid source files were provided.');
    }

    this.combine(sourceFiles)
        .then(function() {
            for (var i = 0, l = this.files.length, retFile; i < l; i++) {
                var file = this.files[i];

                if( retFile = this.isFileHasRetinaSupport( file ) ) {
                    if(
                        ((file.size.width/retFile.size.width) != (file.size.height/retFile.size.height)) ||
                        (file.size.width/retFile.size.width) != 0.5
                    ) {
                        console.error(
                            "Skip: " + retFile.name + " : File size ratio doesn't math original one.\n" +
                            "Retina size: " + retFile.size.width + ":" + retFile.size.height + "\n" +
                            "Original size: " + file.size.width + ":" + file.size.height + "\n" +
                            "\n"
                        );

                        this.retinaFiles.splice( this.retinaFiles.indexOf(retFile), 1 );
                    } else {
                        this.spriteFileRetina.append(retFile.path, this.specs.appendRight);
                    }
                }
            }
            //console.log(this.retinaFiles);

            if( this.retinaFiles.length > 0 ) {
                this.spriteFileRetina.write(this.retinaDestPath, function(err) {
                    if (err) throw err;
                    var that = this;

                    im(this.retinaDestPath).size(function(err, retinaSpriteSize) {
                        that.spriteFile.write(that.destPath, function(err) {
                            if (err) throw err;
                            this.writeStyles(retinaSpriteSize);
                        }.bind(that));
                    });

                }.bind(this));
            } else {
                this.spriteFile.write(this.destPath, function(err) {
                    if (err) throw err;
                    this.writeStyles();
                }.bind(this));
            }
        }.bind(this));
};

Sprites.prototype.getSourceFiles = function(files) {
    var file,
        sourceFiles = [];

    for (var i = 0, l = files.length; i < l; i++) {
        file = path.basename(files[i]);
        if (file.match(/.*\.png$/i) && file != this.destPath) {
            sourceFiles.push(file);
        }
    }

    return sourceFiles;
};

Sprites.prototype.combine = function(files) {
    var deferred = Q.defer();
    async.eachSeries(files, this.processFile.bind(this), function(err) {
        if (err) {
            deferred.reject(new Error(err));
        } else {
            deferred.resolve();
        }
    });
    return deferred.promise;
};

Sprites.prototype.processFile = function(fileName, callback) {
    var filePath = this.sourceDir + '/' + fileName;
    if (!fs.existsSync(filePath)) {
        throw new Error('Source file "' + filePath + '" does not exist.');
    }
    im(filePath).size(function(err, size) {
        if (err) throw err;

        // Check for retina
        if( fileName.toLowerCase().substr(-7, 7) == '@2x.png' ) {
            this.retinaFiles.push({
                path: filePath,
                name: fileName,
                size: size
            });
        } else {
            this.spriteFile.append(filePath, this.specs.appendRight);

            this.files.push({
                name: fileName,
                size: size
            });
        }
        
        callback();
    }.bind(this));
};

Sprites.prototype.isFileHasRetinaSupport = function( file ) {
    var fileName = file.name,
        retinaFileName = fileName.substr(0, ( fileName.length - '.png'.length )) + '@2x.png';

    for(var i = 0, len = this.retinaFiles.length; i < len; i++) {
        if( this.retinaFiles[i].name == retinaFileName ) {
            return this.retinaFiles[i];
        }
    }

    return false;
};

Sprites.prototype.writeStyles = function( retinaSpriteSize ) {
    retinaSpriteSize = retinaSpriteSize || null;
    var that = this;
    var relPath = path.relative(that.sourceDir, path.dirname(that.destPath));
    var spriteFile = path.basename(that.destPath);
    var retinaSpriteFile = path.basename(that.retinaDestPath);
    var date = new Date(),
        imgVer = date.getFullYear().toString() + date.getMonth() + date.getDate() +  date.getHours() + date.getMinutes() + date.getSeconds();
    var content = '';
    var x = -this.borderWidth;
    var y = -this.borderWidth;
    var retX = -this.borderWidth;
    var retY = -this.borderWidth;
    var spriteSize;

    im(that.destPath).size(function(err, size) {
        if (err) throw err;
        spriteSize = {
            width: size.width + 'px',
            height: size.height + 'px'
        };

        for (var i = 0, l = that.files.length; i < l; i++) {
            var file = that.files[i],
                retinaFile = that.isFileHasRetinaSupport( file );

            if( retinaFile ) {
                if( (file.size.width/retinaFile.size.width) || (file.size.width/retinaFile.size.width) )
                var retinaFileRatio = ( that.specs.appendRight ?
                                (file.size.width/retinaFile.size.width)
                                :
                                (file.size.height/retinaFile.size.height)
                );
                retinaFileRatio = 0.5;
                content += util.format(
                    '.%s(@sizePercent: 1;) {\n' +
                    '\tdisplay: inline-block;\n' +
                    '\twidth: (%dpx * @sizePercent);\n' +
                    '\theight: (%dpx * @sizePercent);\n' +
                    '\tbackground-image: url("%s%s");\n' +
                    '\t@media screen and (-webkit-min-device-pixel-ratio:2), \n' +
                                        '\t\t\t\t\t\t(min-device-pixel-ratio:2), \n' +
                                        '\t\t\t\t\t\t(-webkit-min-device-pixel-ratio:1.5), \n' +
                                        '\t\t\t\t\t\t(min-device-pixel-ratio:1.5) {\n' +
                    '\t\tbackground-image: url("%s%s");\n' +
                    '\t\tbackground-position: (%dpx * @sizePercent) (%dpx * @sizePercent);\n' +
                    '\t\tbackground-size: (%s * @sizePercent) (%s * @sizePercent);\n' +
                    '\t}\n' +
                    '\tbackground-position: (%dpx * @sizePercent) (%dpx * @sizePercent);\n' +
                    '\tbackground-size: (%s * @sizePercent) (%s * @sizePercent);\n' +
                    '}\n',
                    that.prefix + file.name.toLowerCase().replace(/\.png/, ''),
                    file.size.width,
                    file.size.height,
                    that.baseUrl,
                    spriteFile + ( that.noCache ? '?'+imgVer: '' ),
                    that.baseUrl,
                    retinaSpriteFile + ( that.noCache ? '?'+imgVer: '' ),
                    retX, retY,
                    Math.ceil(retinaSpriteSize.width * retinaFileRatio) + 'px',
                    Math.ceil(retinaSpriteSize.height * retinaFileRatio)+ 'px',
                    x, y,
                    spriteSize.width, spriteSize.height
                );


                if (that.specs.appendRight) {
                    retX -= Math.ceil(retinaFile.size.width * retinaFileRatio) + that.borderWidth*2;
                } else {
                    retY -= Math.floor(retinaFile.size.height * retinaFileRatio) + that.borderWidth*2;
                }
            } else {
                content += util.format(
                    '.%s(@sizePercent: 1;) {\n' +
                    '\tdisplay: inline-block;\n' +
                    '\twidth: (%dpx * @sizePercent);\n' +
                    '\theight: (%dpx * @sizePercent);\n' +
                    '\tbackground-image: url("%s%s");\n' +
                    '\tbackground-position: (%dpx * @sizePercent) (%dpx * @sizePercent);\n' +
                    '\tbackground-size: (%s * @sizePercent) (%s * @sizePercent);\n' +
                    '}\n',
                    that.prefix + file.name.toLowerCase().replace(/\.png/, ''),
                    file.size.width,
                    file.size.height,
                    that.baseUrl,
                    spriteFile + ( that.noCache ? '?'+imgVer: '' ),
                    x, y,
                    spriteSize.width, spriteSize.height
                );
            }

            if (that.specs.appendRight) {
                x -= file.size.width + that.borderWidth*2;
            } else {
                y -= file.size.height + that.borderWidth*2;
            }
        }

        fs.writeFile(that.lessPath, content, function(err) {
            if (err) throw err;
        });
    });
};

Sprites.prototype.readArgs = function() {
    var argv = process.argv.splice(2);

    if (!argv.length || argv[0] == '-h' || argv[0] == '--help') {
        this.printUsage();
        process.exit();
    }

    var specsFile = argv[0];

    if (!fs.existsSync(specsFile)) {
        console.log('Error: Specs file "' + specsFile + '" does not exist.');
        process.exit();
    }
    specsFile =  path.resolve(specsFile);
    var specs = require(specsFile);

    if (!specs['files'] && !specs['dir']) {
        throw new Error('Missing "files" or "dir" property.');
    }
    if( !specs['dir'] ) {
        specs['dir'] = '.';
    }
    if( !specs['output_dir'] ) {
        specs['output_dir'] = '';
    }
    if( !specs['prefix'] ) {
        specs['prefix'] = '';
    }
    if( !specs['versioning'] ) {
        specs['versioning'] = false;
    }
    if( !specs['nocache'] ) {
        specs['nocache'] = false;
    }
    if( !specs['border'] ) {
        specs['border'] = 2;
    }

    if( specs['sprite'] ) {
        if( specs['versioning'] ) {
            var date = new Date(),
                spriteVer =
                    date.getFullYear().toString() + '.' +
                    (date.getMonth() + 1) + '.' +
                    date.getDate() + '.' +
                    date.getHours() + '.' +
                    (date.getMinutes() + 1) + '.' +
                    (date.getSeconds() + 1);

            specs['sprite'] += '-' + spriteVer;
        }
        specs['sprite'] = specs['output_dir'] + specs['sprite'] + '.png';
    }

    // default directory is same as the json
    if (!specs['sprite']) {
        specs['sprite'] = path.basename(specsFile, '.json') + '.png';
    }
    // relative to the specsFile directory.
    if (specs['sprite'][0] != '/') {
        specs['sprite'] = path.dirname(specsFile) + '/' + specs['sprite'];
    }

    if (!specs['less']) {
        specs['less'] = path.basename(specsFile, '.json') + '.less';
    }

    if (specs['less'][0] != '/') {
        specs['less'] = path.dirname(specsFile) + '/' + specs['less'];
    }

    if (specs['direction']) {
        this.specs.appendRight = specs['direction'] == 'right';
    }

    this.createSprite(
        path.resolve(specsFile, '..', specs['dir']),
        specs['files'],
        specs['sprite'],
        specs['less'],
        specs['base_url'],
        specs['prefix'],
        specs['nocache'],
        specs['border']
    );
};

Sprites.prototype.printUsage = function() {
    console.log('Usage: less-sprites sprite-specs.json');
};

new Sprites();
