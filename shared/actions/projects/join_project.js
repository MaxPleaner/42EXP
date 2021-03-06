import * as constants from './constants';
import { push } from 'react-router-redux';
import {new_chat_message} from './project_messages';
import {add_notification} from '../notifications/notifications';
import uuid from 'node-uuid';


const join_project_success = (projectDetails) => {
  return {
    type: constants.JOIN_PROJECT_SUCCESS,
    projectDetails
  }
}

const join_project = (projectDetails) => {
  if(socket){
    return function(dispatch){
      socket.emit('project:join', projectDetails, function(err,res) {
        if(err) {
          dispatch(add_notification({ id:uuid.v4(), heading:'error', message:'Couldnt Join project', unread:true, server:false}))
        } else {
          console.log('res ? ',res)
          dispatch(join_project_success(res))
          dispatch(push(`/projects/${res.id}/${res.project}/messages`))
          socket.subscribe(res.id).watch((data) => {
            dispatch(new_chat_message(data))
          })
        }
      })
    }
  }
}

export default join_project;
