// ZFS POOL / VOLUME ITEM
// ======================
// Individual item which represents a ZFS pool and its associated volume.
// Contains the datasets, ZVOLs, and other high level objects that are
// properties of the pool.

"use strict";

import _ from "lodash";
import React from "react";
import { Button, ButtonToolbar, Input, Nav, NavItem, Panel } from "react-bootstrap";

import ZAC from "../../../flux/actions/ZfsActionCreators";
import ZM from "../../../flux/middleware/ZfsMiddleware";
import VS from "../../../flux/stores/VolumeStore";

import EventBus from "../../../utility/EventBus";
import ByteCalc from "../../../utility/ByteCalc";

import ZfsUtil from "./utility/ZfsUtil";

import BreakdownChart from "./Volumes/BreakdownChart";
import PoolDatasets from "./Volumes/PoolDatasets";
import PoolTopology from "./Volumes/PoolTopology";
import TopologyEditContext from "./Volumes/contexts/TopologyEditContext";

var Velocity;

if ( typeof window !== "undefined" ) {
  Velocity = require( "velocity-animate" );
} else {
  // mocked velocity library
  Velocity = function() {
    return Promise().resolve( true );
  };
}

const SLIDE_DURATION = 500;
const DRAWERS = [ "files", "snapshots", "filesystem", "disks" ];

// VOLUME EDITING
// ==============
// The editing reconciliation model for Volume relies on the difference
// between state and props. As with a simple form, the intial values are set
// by props. Subsequent modifications to these occur in state, until an
// update task is performed, at which time the new props will be assigned, and
// each mutable value in state is exactly equal to its counterpart in props.
// This pattern is also used to compare user-submitted values to upstream
// changes. In componentWillUpdate, if we can see that the current props and
// state have the same value for a given key, we can update the entry in the
// client's representation without conflict. In the case that these values are
// unequal, we can choose instead to display a warning, indicate that another
// user has modified that field, etc. As always, the last change "wins".

const Volume = React.createClass(
  { displayName: "Volume"

  , propTypes:
    { requestActive: React.PropTypes.func.isRequired
    , existsOnRemote: React.PropTypes.bool
    , data: React.PropTypes.array
    , log: React.PropTypes.array
    , cache: React.PropTypes.array
    , spares: React.PropTypes.array
    , datasets: React.PropTypes.array
    , name: React.PropTypes.string
    , free: React.PropTypes.oneOfType(
        [ React.PropTypes.string
        , React.PropTypes.number
        ]
      )
    , allocated: React.PropTypes.oneOfType(
        [ React.PropTypes.string
        , React.PropTypes.number
        ]
      )
    , size: React.PropTypes.oneOfType(
        [ React.PropTypes.string
        , React.PropTypes.number
        ]
      )
    }


  // REACT COMPONENT MANAGEMENT LIFECYCLE
  // ====================================
  , getDefaultProps () {
      return { existsOnRemote : false
             };
    }

  , getInitialState () {
      return { activeSection : null
             , desiredSection: null
             , editing       : false
             , data          : []
             , log           : []
             , cache         : []
             , spares        : []
             , free          : 0
             , allocated     : 0
             , size          : 0
             , name          : ""
             };
    }

  , componentWillReceiveProps ( nextProps ) {
      if ( this.props.active !== nextProps.active ) {
        // Storage.jsx has authorized an active state on this component, or has
        // revoked it

        if ( nextProps.active ) {
          let allowedSections = this.getAllowedDrawers();
          let newState =
            { activeSection: _.contains( allowedSections
                                       , this.state.desiredSection
                                       )
                           ? this.state.desiredSection
                           : allowedSections[0]
            , desiredSection: null
            , editing: this.props.existsOnRemote
                     ? false
                     : true
            };

          this.setState( newState, this.slideDownDrawer );
        } else {
          let onComplete = () => {
            this.setState({ activeSection: null, editing: false });
          };

          this.slideUpDrawer( onComplete );
        }
      }
    }

  , componentDidUpdate ( prevProps, prevState ) {
      let topologyContextProps =
        { handleReset: this.resetTopology
        , handleTopoRequest: this.handleTopoRequest
        };

      if ( prevState.editing !== this.state.editing ) {
        if ( this.state.editing ) {
          if ( !this.state.name && this.refs.volumeNameInput ) {
            React.findDOMNode( this.refs.volumeNameInput )
                 .getElementsByTagName( "INPUT" )[0]
                 .focus();
          }

          EventBus.emit( "showContextPanel"
                       , TopologyEditContext
                       , topologyContextProps
                       );
        } else {
          EventBus.emit( "hideContextPanel", TopologyEditContext );
        }
      }
    }

  , componentWillUnmount () {
      EventBus.emit( "hideContextPanel", TopologyEditContext );
    }


  // ANIMATION HELPERS
  // =================
  , slideDownDrawer () {
      Velocity( React.findDOMNode( this.refs.drawer )
              , "slideDown"
              , { duration: SLIDE_DURATION
                }
              );
    }

  , slideUpDrawer ( onComplete ) {
      Velocity( React.findDOMNode( this.refs.drawer )
              , "slideUp"
              , { duration: SLIDE_DURATION
                , complete: onComplete
                }
              );
    }


  // DRAWER MANAGEMENT
  // =================
  // Helper methods to mange the state of the Volume's drawer, including
  // communicating its active status to Storage.
  , openDrawer ( desiredSection = null ) {
      this.setState(
        { desiredSection: desiredSection
        }
        , this.props.requestActive.bind( null, this.props.volumeKey )
      );
    }

  , closeDrawer () {
      this.props.requestActive( null );
    }

  , toggleDrawer ( event ) {
      if ( this.state.activeSection ) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    }

  , getAllowedDrawers () {
      // TODO: Needs more complex logic
      if ( this.props.existsOnRemote ) {
        return [ _.last( DRAWERS ) ];
      } else {
        return [ _.last( DRAWERS ) ];
      }
    }

  , handleDrawerChange ( keyName ) {
      if ( DRAWERS.has( keyName ) ) {
        this.setState({ activeSection: keyName });
      } else {
        this.setState({ activeSection: null });
      }
    }


  // ZFS TOPOLOGY FUNCTIONS
  // ======================
  , handleTopoRequest ( preferences ) {
      let creatorOutput =
        ZfsUtil.createTopology( VS.availableSSDs
                              , VS.availableHDDs
                              , preferences
                              );

      let topology = creatorOutput[0];
      let devicesUsed = creatorOutput[1];

      ZAC.replaceDiskSelection( devicesUsed );
      this.setState( topology );
    }

  , vdevOperation( opType, key, purpose, options = {} ) {
      let collection  = this.state[ purpose ];
      let targetVdev  = collection[ key ];
      let currentType = null;
      let disks       = opType === "add" && options.path
                      ? [ options.path ]
                      : [];

      if ( targetVdev ) {

        switch ( opType ) {
          case "add":
            currentType = targetVdev.type;
            disks.push( ...ZfsUtil.getMemberDiskPaths( targetVdev ) );
            break;

          case "remove":
            currentType = targetVdev.type;
            disks.push(
              ..._.without( ZfsUtil.getMemberDiskPaths( targetVdev )
                          , options.path
                          )
            );
            break;

          case "nuke":
            ZAC.deselectDisks( ZfsUtil.getMemberDiskPaths( targetVdev ) );
            break;

          case "changeType":
            currentType = options.type;
            disks.push( ...ZfsUtil.getMemberDiskPaths( targetVdev ) );
            break;
        }
      }

      this.setState(
        ZfsUtil.reconstructVdev( key
                               , purpose
                               , collection
                               , disks
                               , currentType
                               )
      );
    }

  , handleDiskAdd ( vdevKey, vdevPurpose, path ) {
      ZAC.selectDisks( path );
      this.vdevOperation( "add"
                        , vdevKey
                        , vdevPurpose
                        , { path: path }
                        );
    }

  , handleDiskRemove ( vdevKey, vdevPurpose, path, event ) {
      ZAC.deselectDisks( path );
      this.vdevOperation( "remove"
                        , vdevKey
                        , vdevPurpose
                        , { path: path }
                        );
    }

  , handleVdevNuke ( vdevKey, vdevPurpose, event ) {
      this.vdevOperation( "nuke"
                        , vdevKey
                        , vdevPurpose
                        );
    }

  , handleVdevTypeChange ( vdevKey, vdevPurpose, vdevType, event ) {
      this.vdevOperation( "changeType"
                        , vdevKey
                        , vdevPurpose
                        , { type: vdevType }
                        );
    }

  , resetTopology () {
      ZAC.replaceDiskSelection( [] );
      this.setState(
        { data: []
        , log: []
        , cache: []
        , spares: []
        , free: 0
        }
      );
    }


  // GENERAL HANDLERS
  // ================
  , handleVolumeNameChange ( event ) {
      this.setState({ name: event.target.value });
    }


  // MIDDLEWARE COMMUNICATION
  // ========================
  , submitVolume () {
      let { log, cache, data, spares, name } = this.state;

      let newVolume =
        { topology:
          { log: ZfsUtil.unwrapStripe( log ) || this.props.log
          , cache: ZfsUtil.unwrapStripe( cache ) || this.props.cache
          , data: ZfsUtil.unwrapStripe( data ) || this.props.data
          , spares: ZfsUtil.unwrapStripe( spares ) || this.props.spares
          }
        , type: "zfs"
        , name: name || this.props.name
              || "Volume" + ( this.props.volumeKey + 1 )
        };

      ZM.submitVolume( newVolume );
      this.setState(
        { editing: false
        }
      );
    }


  // RENDER METHODS
  // ==============
  , createVolumeName () {
      let name = this.state.name || this.props.name;

      if ( this.state.editing ) {
        return (
          <div className="volume-name-input">
            <Input
              ref = "volumeNameInput"
              type = "text"
              placeholder = "Volume Name"
              onClick = { event => event.stopPropagation() }
              onChange = { this.handleVolumeNameChange }
              className = "form-overlay"
              value = { name }
            />
          </div>
        );
      } else {
        return (
          <h3 className="pull-left volume-name">{ name }</h3>
        );
      }
    }

  , createDrawerContent () {
      switch ( this.state.activeSection ) {
        case "disks":
          // TODO: Temporary workaround until editing volumes works
          let { data, log, cache, spares } = this.props.existsOnRemote
                                            ? this.props
                                            : this.state;

          return (
            <PoolTopology
              data = { data }
              log = { log }
              cache = { cache }
              spares = { spares }
              handleDiskAdd = { this.handleDiskAdd }
              handleDiskRemove = { this.handleDiskRemove }
              handleVdevRemove = { this.handleVdevRemove }
              handleVdevNuke = { this.handleVdevNuke }
              handleVdevTypeChange = { this.handleVdevTypeChange }
              editing = { this.state.editing }
            />
          );
        case "filesystem":
          return (
            <PoolDatasets ref="Storage" />
          );
      }
    }

  , render () {
      let notInitialized = !this.props.existsOnRemote && !this.state.editing;

      let panelClass = [ "volume" ];
      if ( notInitialized ) { panelClass.push( "awaiting-init" ); }
      if ( this.state.editing ) { panelClass.push( "editing" ); }

      let initMessage    = null;
      let volumeInfo     = null;
      let drawer         = null;
      let changesToolbar = null;

      if ( notInitialized ) {
        // We can deduce that this Volume is the "blank" one, and that it has
        // not yet been interacted with. We use this state information to
        // display an initialization message.

        initMessage = (
          <div className="text-center">
            <Button
              bsStyle = "primary"
              onClick = { this.openDrawer.bind( this, "disks" ) }
            >
            { "Create new ZFS volume" }
            </Button>
          </div>
        );
      } else {
        let sectionNav = null;
        let used, parity, free, total;

        if ( this.state.editing ) {
          let breakdown = ZfsUtil.calculateBreakdown( this.state.data );
          used   = 0;
          parity = breakdown.parity;
          free   = breakdown.avail;
          total  = breakdown.avail + breakdown.parity;
        } else {
          let rootDatasetProperties = _.find( this.props.datasets
                                            , { name: this.props.name }
                                            ).properties;
          let breakdown = ZfsUtil.calculateBreakdown( this.props.data );
          used = ByteCalc.convertString( rootDatasetProperties.used.rawvalue );
          free = ByteCalc.convertString( rootDatasetProperties.available.rawvalue );
          parity = ZfsUtil.calculateBreakdown( this.props.data ).parity;
          total = used + free + parity;
        }

        if ( this.state.editing ) {
          changesToolbar = (
            <div className ="volume-info clearfix">
              <ButtonToolbar className="pull-right">
                <Button
                  bsStyle = "default"
                  onClick = { this.closeDrawer }
                >
                  { "Cancel" }
                </Button>
                <Button
                  bsStyle = "primary"
                  disabled = { !this.state.editing }
                  onClick = { this.submitVolume }
                >
                  { "Submit" }
                </Button>
              </ButtonToolbar>
            </div>
          );
        }

        volumeInfo = (
          <div
            className = "volume-info"
            onClick = { this.toggleDrawer }
          >
            <div className="clearfix">
              { this.createVolumeName() }
              <h3 className="pull-right volume-capacity">
                { ByteCalc.humanize( free ) }
              </h3>
            </div>
            { changesToolbar }
            <BreakdownChart
              total  = { total }
              parity = { parity }
              used   = { used }
              free   = { free }
            />
          </div>
        );

        if ( this.props.existsOnRemote ) {
          // FIXME: Temporary measure to keep navigation from showing when first
          // creating a pool
          sectionNav = (
            <Nav
              className = "volume-nav"
              bsStyle   = "pills"
              activeKey = { this.state.activeSection }
              onSelect  = { this.handleDrawerChange }
            >
              <NavItem disabled> {/* FIXME */}
                {"Files"}
                </NavItem>
              <NavItem eventKey="filesystem">
                {"Shares"}
              </NavItem>
              <NavItem disabled> {/* FIXME */}
                {"Snapshots"}
              </NavItem>
              <NavItem eventKey="disks">
                {"Topology"}
              </NavItem>
            </Nav>
          );
        }

        drawer = (
          <div
            ref = "drawer"
            style = {{ display: "none" }}
            className = "volume-drawer"
          >
            { sectionNav }
            { this.createDrawerContent() }
          </div>
        );
      }

      return (
        <Panel
          className = { panelClass.join( " " ) }
        >
          { initMessage }
          { volumeInfo }
          { drawer }
        </Panel>
      );
    }

  }
);

export default Volume;
