// ROOT REDUCER
// ============

import { combineReducers } from "redux";

import auth from "./auth";
import disks from "./disks";
import rpc from "./rpc";
import shells from "./shells";
import subscriptions from "./subscriptions";
import system from "./system";
import tasks from "./tasks";
import volumes from "./volumes";
import websocket from "./websocket";
import ssh from "./ssh";
import users from "./users";

const rootReducer = combineReducers(
  { auth
  , disks
  , rpc
  , shells
  , subscriptions
  , system
  , tasks
  , volumes
  , websocket
  , users

  // SERVICES
  , ssh
  }
);

export default rootReducer;
