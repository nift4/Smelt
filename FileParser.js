var util = require('util');
var fs = require('fs');
var chalk = require('chalk');
var ncp = require("copy-paste");
var CommandCreator = require("./CommandCreator");
var BangCommandHelper = require("./BangCommandHelper");
var Program = require("./Program");

var FileParser = (function () 
{
    function FileParser() 
	{
		this.Commands = [];
		this.BangSetups = [];
		this.PreviousLine = "";
		this.FinalCommand = "";
	}
	
    FileParser.prototype.ProcessFile = function (filePath)
	{
		var data = fs.readFileSync(filePath);
		
		console.log(chalk.yellow(util.format("\nProcessing %s", filePath)));
		this.ProcessData(data, filePath);
		
		if(this.BangSetups.length)
		{
			Program.SingleFile = false;
			var self = this;
			this.BangSetups.forEach(function(setup)
			{
				console.log(chalk.yellow(util.format("\nTo use the \"!%s\" command you will need to also install the following command into your world:", setup.bangName)));
				self.ProcessData(setup.setupData, setup.fileName);
			});
		}
		
		if(Program.Clipboard)
		{
			if(Program.SingleFile)
			{
				ncp.copy(this.FinalCommand, function () {
					console.log(chalk.green("\n  The compiled command is now in your clipboard."));
				})
			}
			else
			{
				console.log(chalk.red("\n  WARNING: The 'clipboard' option can not be used when more than one compiled-command is produced."));
			}
		}
    };
	
	FileParser.prototype.ProcessData = function (data, sourceName)
	{
		CommandCreator.startNewFile();
		
		this.Commands = [];
	
		var content = data.toString().trim();
		var lines = content.split("\n");
		var distanceOffset = 3;
		
		var type = "impulse";
		var conditional = false;
		var auto = true;
		
		var commands = [];
		for(i=0; i < lines.length; i++)
		{
			var line = lines[i].trim();
			try
			{
				this.processLine(line);
			}
			catch(err)
			{
				console.log(chalk.red.bold("\n\n  LINE ERROR!"));
				console.log(util.format(chalk.red.bold("  Error on %s:%d - %s\n\n"), sourceName, i, err));
				throw err;
			}
		}
		
		var gamerule = "gamerule commandBlockOutput false";
		var clearArea = "fill ~1 ~-1 ~1 ~14 ~10 ~14 air 0";
		var summonMarker = "summon ArmorStand ~ ~-1 ~ {Tags:[\"oc_rebuild\",\"oc_marker\"]}"
		var clearlineMarkers = "/execute @e[tag=oc_rebuild] ~ ~ ~ kill @e[tag=oc_marker,dx=15,dy=20,dz=15]";
		var clearlineMarkers_old = "kill @e[tag=lineMarker,dx=15,dy=20,dz=15]"; // keep for backwards compatibility
		this.Commands.unshift(gamerule, clearArea, summonMarker, clearlineMarkers, clearlineMarkers_old);
		
		var removeBlocks = CommandCreator.buildSetblockCommand(0, 1, 0, "up", "impulse", false, true, "", "/fill ~ ~-1 ~ ~ ~ ~ air");
		
		var removeMinecarts = "kill @e[type=MinecartCommandBlock,r=0]";
		this.Commands.push(removeBlocks, removeMinecarts);
		
		//if(Program.Debug) console.log("\n\nCREATE IN THIS ORDER:\n");
		
		var minecarts = []
		for(i=0; i < this.Commands.length; i++)
		{
			var command = this.Commands[i];
			var minecart = util.format("{id:MinecartCommandBlock,Command:%s}", JSON.stringify(command)); 
			minecarts.push(minecart);
			//if(Program.Debug) console.log(minecart);
		}
		
		var minecartsString = minecarts.join(",");
		this.FinalCommand = "summon FallingSand ~ ~1 ~ {Block:activator_rail,Time:1,Passengers:[%s]}"
		
		this.FinalCommand = util.format(this.FinalCommand, minecartsString);
		
		if(Program.OutputCommand)
		{
			console.log("\n\COMPILED-COMMAND:\n");
			console.log(this.FinalCommand);
		}
		
		var outputFileName = sourceName.replace(".mcc", ".oc");
		fs.writeFileSync(outputFileName, this.FinalCommand);
		console.log(chalk.green("\n * Saved " + outputFileName));
		
	};
	
    FileParser.prototype.processLine = function (line)
	{
		if(line.endsWith('\\'))
		{				
			this.PreviousLine += line.replace("\\", "");					
			return;
		}
		else
		{
			if(this.PreviousLine.length > 0)
			{
				line = this.PreviousLine + line;
				this.PreviousLine = "";
			}
		}
		
		if(line.indexOf("#") == 0)
		{
			this.processRowLine(line);
		}
		else if(line.indexOf("{") == 0)
		{
			this.processJsonLine(line);
		}
		else if(line.indexOf("/") == 0)
		{
			this.processCommandBlockLine(line);
		}
		else if(line[0] == "!")
		{	
			this.processBangLine(line);
		}
    };
	
	FileParser.prototype.processRowLine = function(line)
	{
		var summon = CommandCreator.startNewLine(line);
		if(summon) this.Commands.unshift(summon);
		
		if(Program.Debug)
		{
			console.log(chalk.bold("\n\n* START NEW LINE!"))
			console.log("  " + line);
			if(summon) console.log("   -> " + summon);
		}
	};
	
	FileParser.prototype.processJsonLine = function(line)
	{
		var json = JSON.parse(line);
		CommandCreator.processJSONLine(json);
		
		if(Program.Debug)
		{
			console.log(chalk.bold("\n* PROCESS JSON OPTIONS"));
			console.log("  " + JSON.stringify(json));
			console.log("   -> type = " + CommandCreator.type);
			console.log("   -> conditional = " + CommandCreator.conditional);
			console.log("   -> auto = " + CommandCreator.auto);
			console.log("   -> executeAs = " + CommandCreator.executeAs);
			console.log("   -> markerTag = " + CommandCreator.markerTag);
		}
	};
	
	FileParser.prototype.processCommandBlockLine = function(line)
	{
		var summon = CommandCreator.addNewCmdMarker();
		if(summon) this.Commands.unshift(summon);
		
		var command = CommandCreator.addSetblockCommand(line);
		this.Commands.unshift(command);
		
		if(Program.Debug)
		{
			console.log(chalk.bold("\n* CREATE COMMAND BLOCK"));
			console.log("  " + line);
			console.log("   -> " + command);
			if(summon) console.log("   -> " + summon);
		}
	};
	
	FileParser.prototype.processBangLine = function(line)
	{
		if(Program.Debug)
		{
			console.log(chalk.bold("\n* PROCESS BANG COMMAND"));
			console.log("  " + line);
		}
		var commands = BangCommandHelper.ProcessBang(line, this);
		if(Program.Debug)
		{
			console.log("  Commands generated:");
		}
		if(commands.length > 0)
		{
			var self = this;
			commands.forEach(function(command)
			{
				if(Program.Debug) console.log("   -> " + command);
				self.Commands.unshift(command);
			});
		}
	};
	
    return FileParser;
	
})();

module.exports = FileParser;