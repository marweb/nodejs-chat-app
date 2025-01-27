const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require("socket.io");

const {generateMessage, generateLocationMessage,generateFiles} = require('./utils/message');
const {isRealString} = require('./utils/validation');
const {Users} = require('./utils/users');
const {upload} = require("./middlewares/file-upload");

const publicPath = path.join(__dirname, '../public');
const port = process.env.PORT || 3000;
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { /* options */ });
const users = new Users();

app.use(express.static(publicPath));

app.get('/:file(*)', function(req, res, next){ // this routes all types of file

    let path=require('path');
    const file = req.params.file;
    path = path.resolve(".")+'/'+file;
    res.download(path); // magic of download function

});

// Handle file upload route
app.post('/upload', upload.single('file'), (req, res,next) => {
    // Access uploaded file information using req.file
    if (!req.file) {
        // Send error
        return res.status(400).send({ error: 'File not uploaded' });
    }
    res.send({file: req.file});
});


io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('join', (params, callback) => {
        if (!isRealString(params.name) || !isRealString(params.room)) {
            return callback('Nombre y Sala son requeridos.');
        }

        socket.join(params.room);
        users.removeUser(socket.id);
        users.addUser(socket.id, params.name, params.room);

        io.to(params.room).emit('updateUserList', users.getUserList(params.room));
        socket.emit('newMessage', generateMessage('Admin', 'Bienvenido al chat app'));
        socket.broadcast.to(params.room).emit('newMessage', generateMessage('Admin', `${params.name} ha ingresado.`));
        callback();
    });

    socket.on('createMessage', (message, callback) => {
        const user = users.getUser(socket.id);
        console.log(user);
        console.log(socket.id);

        if (user && isRealString(message.text)) {
            io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
        }

        callback();
    });
    socket.on('createPrivateMessage', (message) => {
       socket.broadcast.to(message.userid).emit('newPrivateMessage',{
           message:message.message,
           user:users.getUser(socket.id)
       });
       console.log(message.message);
    });
    socket.on('privateMessageWindow', (userid) => {
        const user = users.getUser(socket.id);
        console.log(userid);
        socket.broadcast.to(userid.id).emit('notifyUser',{
            user:users.getUser(socket.id),
            otherUser:userid.id
        });
    });
    socket.on('private_connection_successful',(user) => {
        console.log(user.otherUserId);
        socket.broadcast.to(user.user.id).emit('openChatWindow',{
            user:users.getUser(user.otherUserId)
        });
    });
    socket.on('privateMessageSendSuccessful',function (message) {
        console.log(users.getUser(socket.id));
        const message_object ={
            message:message.message,
            user:users.getUser(message.userid),
            id:socket.id
        }
        socket.broadcast.to(message.userid).emit('privateMessageSuccessfulAdd',message_object);
    });
    socket.on('createLocationMessage', (coords) => {
        const user = users.getUser(socket.id);

        if (user) {
            io.to(user.room).emit('newLocationMessage', generateLocationMessage(user.name, coords.latitude, coords.longitude));
        }
    });
    //This part is for uploading file
    socket.on('newFileMessage',(fileInfo) =>{
        console.log(fileInfo);
        const user = users.getUser(socket.id);
        console.log(user);
        if (user) {
            io.to(user.room).emit('newFileMessage', generateFiles(user.name, fileInfo.filename));
        }
    });
    socket.on('newPrivateFileMessage',(info) =>{
       const user = users.getUser(socket.id);
       console.log(user);
       console.log(info.fileInfo);
       socket.broadcast.to(info.userid).emit('newPrivateFileMessage',{
           user:user,
           fileInfo:info.fileInfo
       });
    });
    socket.on('privateFileSendSuccessful', (info) =>{
        const user = users.getUser(info.user.id);
        socket.broadcast.to(info.user.id).emit('privateFileSendSuccessful',{
           filename:info.fileInfo.filename,
           user:user,
           id:socket.id
        });
    });
    socket.on('createPrivateLocationMessage',(coords) =>{
        const user = users.getUser(socket.id);
        const location = generateLocationMessage(user.name,coords.latitude,coords.longitude);
        socket.broadcast.to(coords.userid).emit('newPrivateLocationMessage', {
            location:location,
            user:user
        });
    });
    socket.on('locationMessageSuccessful',(message) =>{
        const newMessage ={
            message:message,
            id:socket.id
        }
        socket.broadcast.to(message.user.id).emit('locationMessageSuccessful',newMessage);
    });
    socket.on('initializeAudioCall', (userid) =>{
        const user = users.getUser(socket.id);
       socket.broadcast.to(userid).emit('incomingCall',user); 
       console.log(userid);
    });
    socket.on('initializeVideoCall', (userid) =>{
       const user = users.getUser(socket.id);
       socket.broadcast.to(userid).emit('incomingVideoCall',user);
    });
    socket.on('callReceived', (userid) =>{
       socket.broadcast.to(userid).emit('notifyCallReceived'); 
    });
    socket.on('videoCallReceived', (userid) =>{
        socket.broadcast.to(userid).emit('notifyVideoCallReceived');
    });
    socket.on('audioCall', (stream) =>{
        socket.broadcast.to(stream.userid).emit('onAudioCall',stream.blob);
    });
    socket.on('videoCall', (stream) =>{
        socket.broadcast.to(stream.userid).emit('onVideoCall',stream.blob);
    })
    socket.on('callEnded', (userid) =>{
       const user = users.getUser(socket.id);
       socket.broadcast.to(userid).emit('callEnded',user);
       console.log(userid);
    });
    socket.on('videoCallEnded', (userid) =>{
       const user = users.getUser(socket.id);
       socket.broadcast.to(userid).emit('videoCallEnded',user);
       console.log(userid);
    });
    socket.on('userBusy', (userid) =>{
        socket.broadcast.to(userid).emit('userBusy');
    })
    socket.on('userVideoBusy', (userid) =>{
        socket.broadcast.to(userid).emit('userVideoBusy');
    });
    socket.on('callNotReceived', (userid) =>{
        socket.broadcast.to(userid).emit('callNotReceived');
    });
    socket.on('videoCallNotReceived', (userid) =>{
        socket.broadcast.to(userid).emit('videoCallNotReceived');
    })
    //end file uploading part
    socket.on('disconnect', () => {
        const user = users.removeUser(socket.id);

        if (user) {
            io.to(user.room).emit('updateUserList', users.getUserList(user.room));
            io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left.`));
        }
    });
});

httpServer.listen(port, () => {
    console.log(`Server is up on ${port}`);
});
