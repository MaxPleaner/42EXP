import express from 'express';
import serveStatic from 'serve-static';
import path from 'path';
import cookieParser from 'cookie-parser'
import passport from './passport/passport_github.js';
import jwt from 'jsonwebtoken';
import handleRender from './server-render/handle-render.js';
import bodyParser from 'body-parser';
import { Register, Login } from './local_Auth/localAuth.js'
import { skill_suggestions, skill_user } from './socketHandlers/skills.js'
import { category_suggestions } from './socketHandlers/category.js'
import * as projectHandlers from './socketHandlers/project.js'
import { vote } from './socketHandlers/vote.js';
import { user_profile } from './socketHandlers/user.js';
import { db, queries } from './config';
import winston from 'winston';
import {vote_notification, set_to_read_notification} from './socketHandlers/notifications.js'
import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';

const config = require('../webpack.config.js')

const compiler = webpack(config)

export const run = (worker) => {
  console.log(' >> worker PID: ',process.pid);

  winston.add(require('winston-daily-rotate-file'),{
    filename:'logs/42exp.log',
    datePattern: '.dd-MM-yyyy'
  })

  const app = express();

  const httpServer = worker.httpServer;
  const scServer = worker.scServer;

  //standard express fluff
  if(process.env.NODE_ENV.trim() === 'development'){
    // app.use(serveStatic(path.resolve(__dirname, '../public')));
    app.use(webpackDevMiddleware(compiler, {
      publicPath: config.output.publicPath,
      stats: { colors: true }
    }))
    app.use(webpackHotMiddleware(compiler, {
      log: console.log
    }))
  }

  app.use(cookieParser())
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(passport.initialize())

  app.get('/auth/github',passport.authenticate('github'))

  // To-Do : Failure Redirect
  app.get('/auth/github/callback',passport.authenticate('github',{ failureRedirect: '/fail' }),
    function(req,res){
      var text=  JSON.stringify(req.user.token)
      res.cookie('id_token',text,{ expires: new Date(Date.now() + (24 * 60 * 60 * 1000 * 30 * 12 * 10)), httpOnly: true })
      res.redirect('/')
    }
  )

  app.post('/auth/register',Register)
  app.post('/auth/login',Login)

  app.get('/logout',function(req,res){
    res.clearCookie('id_token');
    res.redirect('/')
  })

  // passport.js doesnt work without serializerUser and deserializeUser. Adding this for now.

  passport.serializeUser(function(user,done){
    done(null,user)
  });

  passport.deserializeUser(function(user,done){
    done(null,user)
  });

  app.use(handleRender)



  httpServer.on('request',app);

  scServer.on('connection',(socket) => {
    console.log('socket connected : ',socket.id)
    //what the above does is decode the socket cookie. decode the string > sets auth profile to socket.
    if (socket.request.headers.cookie) {
      const cookie = decodeURIComponent(socket.request.headers.cookie)
      const id_token = JSON.parse(cookie.split('=')[1])
      const decoded = jwt.verify(id_token,process.env.JWT_SECRET)
      winston.info('User logged in : ',decoded.username)
      socket.setAuthToken({ username: decoded.username })
    }

    // skill suggestions for user profile.
    socket.on('skill:suggestions',function(data,res){
      skill_suggestions(data)
        .then(function(skill){
          res(null,skill)
        })
        .catch(function(err){
          res(err)
        })
    })

    // saving skills to a user skillset.
    socket.on('skills:user',function(data,res){
      data.username = socket.getAuthToken().username;
      skill_user(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          winston.error('There was an error with skill_user: ',err)
          res('Could Add skill to account')
        })
    })

    // category suggestions for projects.
    socket.on('category:suggestions',function(data,res){
      category_suggestions(data)
        .then(function(category){
          res(null,category)
        })
        .catch(function(err){
          res(err)
        })
    })

    // project creation.
    socket.on('project:create',function(data,res){
      data.username = socket.getAuthToken().username;
      projectHandlers.create_new_project(data)
        .then(function(details){
          winston.info('new project created : ',details)
          res(null,details)
        })
        .catch(function(err){
          winston.error('Error with createNewProject: ',err)
          res('Couldnt create project')
        })
    })

    //Retrieves a list of projects
    socket.on('project:list',function(data,res){
      projectHandlers.project_list(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          winston.error('Problem with project:list : ',err)
          res('Couldnt retrieve project list')
        })
    })

    //pagination
    socket.on('project:list_more',function(data,res){
      projectHandlers.project_paginate(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })

    // project detail.
    socket.on('project:detail',function(data,res){
      projectHandlers.project_detail(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          winston.error('Problem with project:detail : ',err)
          res('Couldnt retrieve project detail')
        })
    })

    // function allowing user to join a project group.
    socket.on('project:join',function(data,res){
      data.username = socket.getAuthToken().username;
      projectHandlers.join_project(data)
        .then(function(result){
          //broadcast user join to chat room
          scServer.exchange.publish(data.id,{ project_id: data.id,
            timestamp: result.roomMessage.timestamp,
            message: result.roomMessage.message,
            username: result.roomMessage.username,
            message_type: result.roomMessage.message_type
          })
          res(null,result.result)
        })
        .catch(function(err){
          winston.error('User cant join project : ',err)
          res('Cant join project')
        })
    })

    socket.on('project:member_list',function(data,res){
      projectHandlers.project_member_list(data)
        .then(function(data){
          res(null,data)
        })
        .catch(function(err){
          res(err)
        })
    })

    // check if project_name already exists.
    socket.on('project:check_name',function(data,res){
      projectHandlers.project_check_name(data)
        .then(function(name){
          res(null,name)
        })
        .catch(function(err){
          res(null,err)
        })
    })

    // edit an existing project.
    socket.on('project:edit',function(data,res){
      projectHandlers.edit_project(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })

    socket.on('project:get_messages',function(data,res){
      projectHandlers.get_messages(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })
    // retrieve past messages for chat room.
    socket.on('project:get_more_messages',function(data,res){
      projectHandlers.get_more_messages(data)
        .then(function(messages){
          res(null,messages)
        })
        .catch(function(err){
          res(err)
        })
    })

    socket.on('new_chat_message',function(data){
      data.timestamp = new Date().toISOString()
      data.username = socket.getAuthToken().username
      const messageDetails = {
        project_id: data.id,
        timestamp: data.timestamp,
        message: data.message,
        username:socket.getAuthToken().username
      }
      scServer.exchange.publish(data.id,messageDetails)
      projectHandlers.new_project_message(data)
        .then(function(data){
          return ''
        })
        .catch(function(err){
          console.log('err: ',err)
        })
    })

    // users last_activity in a project chat room. Essential to determine unread_messaages.
    socket.on('update_last_activity',function(data,res){
      const username = socket.getAuthToken().username
      projectHandlers.update_last_activity(data,username)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })

    socket.on('user:profile',function(data,res){
      user_profile(data)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })

    socket.on('notifications:set_to_read',function(data,res){
      let user = socket.getAuthToken().username;
      set_to_read_notification(data,user)
        .then(function(result){
          res(null,result)
        })
        .catch(function(err){
          res(err)
        })
    })


    // When user commends another for a particular skill.
    socket.on('user:vote',function(data,res){
      data.voter = socket.getAuthToken().username;
      vote(data)
        .then(function(status){
          vote_notification.call(socket,data,status)
            .then(function(result){
              res(null,status.vote)
            })
            .catch(function(err){
              winston.error('there was an error with setting the notification for user : ',err)
              res(null,status.vote) //send message to votee anyway because commend was successfull at least.
            })
          })
        .catch(function(err){
          winston.error('there was an error with vote function  : ',err, ' with data : ',data)
          res('There was an error with the vote')
        })
    })

    socket.on('raw',function(data){
      let pattern = new RegExp('/projects/(\\d+)/((?:[a-zA-Z0-9-_]|%20)+)/messages')
      let match = data.match(pattern)
      if(match){
        db.one('update account_projects SET last_activity=Now() where project=(SELECT name from project where id=$1) AND username=$2 returning *',
          [parseInt(match[1]),socket.getAuthToken().username]
        ).then(function(data){

        }).catch(function(err){
          winston.error('Couldnt update last_activity of user : ',err)
        })
      }
    })

  })
}
