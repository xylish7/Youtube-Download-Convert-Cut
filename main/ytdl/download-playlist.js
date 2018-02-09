// Modules
const ytdl = require('youtube-dl')
const fs = require('fs')
const {ipcMain} = require('electron')

// Internam modules
const mp3converter = require('../conversion/mp3Converter')
const {killAllProcesses} = require('../kill-processes/app-notifications')

exports.options = {
  maxBuffer: Infinity
}

exports.args = []

exports.staticInfo = {
  win: false,
  informationExtracted: false,
  downloadFinished: false,
  appendColumns: true,
  isPlaylist: false,
  keepFiles: false
}

exports.ipcEvent = {}

var video, stream
exports.playlist = (url) => {
 
  var dynamicInfo = {}
  video = ytdl(url, this.args, this.options)
  
  // Catch error
  video.on('error', (err) => { 
    this.ipcEvent.event.sender.send('ytdl-errors', err)
  });

  // Get video information
  video.on('info', (info) => {
  
    this.staticInfo.keepFiles = this.ipcEvent.downloadInfo.keepFilesCheckbox
    this.staticInfo.isPlaylist = info.playlist_index
    if (this.staticInfo.isPlaylist != null) {
      if (!this.staticInfo.informationExtracted) {
        this.staticInfo.informationExtracted = true 
        // Get number of videos in playlist
        this.staticInfo.n_entries = info.n_entries
      }
    }
          
    // Get video index in playlist
    dynamicInfo =  {
      playlist_index: info.playlist_index,
      _raw_duration: info._duration_raw,
      title: info.title.replace(/[\\/|":*?<>']/g, ""),
      size: info.size,
    }
  
    // Save path
    var outputFile = `${this.ipcEvent.downloadInfo.savePath}\\${dynamicInfo.title}.webm`

    // Start writing video in directory
    stream = fs.createWriteStream(outputFile)
    video.pipe(stream);
    // Send the information gathered until now
    this.ipcEvent.event.sender.send('playlist-progress', {
      static: this.staticInfo,
      dynamic: dynamicInfo
    })
  
    this.staticInfo.appendColumns = false
  });

  // Calculate the progress of download
  var position = 0
  video.on('data', (chunk) =>{ 
    position += chunk.length;

    if (dynamicInfo.size) {
      dynamicInfo.percent = (position / dynamicInfo.size * 100).toFixed(2);

      this.ipcEvent.event.sender.send('playlist-progress', {
        static: this.staticInfo,
        dynamic: dynamicInfo
      })
    }
  });
  
  // Executed when video it's downloaded
  video.on('end', () => {
    // Send event if download finished
    var staticInfo = this.staticInfo
    if (staticInfo.n_entries == dynamicInfo.playlist_index) {
      staticInfo.downloadFinished = true
      this.ipcEvent.event.sender.send('playlist-progress', {
        static: staticInfo,
        dynamic: dynamicInfo
      })
    }
    // Parameter used to append new progress bar for every video
    staticInfo.appendColumns = true    

    // Convert video
    if (this.ipcEvent.downloadInfo.mp3Conversion == 'true') {
      var static = staticInfo,
          dynamic = dynamicInfo
      mp3converter.convertVideo({static, dynamic}, this.ipcEvent.downloadInfo)
    }   
  });

  // Download next video
  video.on('next', this.playlist);
} 

ipcMain.on('stop-download', (event) => {
  stream.end()
  video.unresolve()
  //video.removeSource()
  killAllProcesses()
  this.staticInfo.appendColumns = true
  this.staticInfo.downloadFinished = false
  event.sender.send('response')
})

exports.stopOnClose = () => {
  if (stream) stream.end()
  video.unresolve()
}
