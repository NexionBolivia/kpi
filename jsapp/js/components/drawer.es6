import React from 'react';
import PropTypes from 'prop-types';
import reactMixin from 'react-mixin';
import autoBind from 'react-autobind';
import Reflux from 'reflux';
import { Link } from 'react-router';
import Select from 'react-select';

import {dataInterface} from '../dataInterface';
import {actions} from '../actions';
import {stores} from '../stores';
import {bem} from '../bem';
import {searches} from '../searches';
import ui from '../ui';
import mixins from '../mixins';

import LibrarySidebar from '../components/librarySidebar';
import {
  IntercomHelpBubble,
  SupportHelpBubble
} from '../components/helpBubbles';

import {MODAL_TYPES} from '../constants';

import {assign} from 'utils';

import SidebarFormsList from '../lists/sidebarForms';

import {customSession} from 'kpi-custom-modules/lib/session/CustomSession'
class FormSidebar extends Reflux.Component {
  constructor(props){
    super(props);
    this.state = assign({
      currentAssetId: false,
      files: []
    }, stores.pageState.state);
    this.stores = [
      stores.session,
      stores.pageState
    ];
    autoBind(this);
  }
  componentWillMount() {
    this.setStates();
  }
  setStates() {
    this.setState({
      headerFilters: 'forms',
      searchContext: searches.getSearchContext('forms', {
        filterParams: {
          assetType: 'asset_type:survey',
        },
        filterTags: 'asset_type:survey',
      })
    });
  }
  newFormModal (evt) {
    evt.preventDefault();
    stores.pageState.showModal({
      type: MODAL_TYPES.NEW_FORM
    });
  }
  render () {
    return (
      <bem.FormSidebar__wrapper>
        <bem.KoboButton onClick={this.newFormModal} m={['blue', 'fullwidth']}>
          {t('new')}
        </bem.KoboButton>
        <SidebarFormsList/>
      </bem.FormSidebar__wrapper>
    );
  }
  componentWillReceiveProps() {
    this.setStates();
  }

};

FormSidebar.contextTypes = {
  router: PropTypes.object
};

reactMixin(FormSidebar.prototype, searches.common);
reactMixin(FormSidebar.prototype, mixins.droppable);

class DrawerLink extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);
  }
  onClick (evt) {
    if (!this.props.href) {
      evt.preventDefault();
    }
    if (this.props.onClick) {
      this.props.onClick(evt);
    }
  }
  render () {
    var icon_class = (this.props['ki-icon'] == undefined ? 'fa fa-globe' : `k-icon-${this.props['ki-icon']}`);
    var icon = (<i className={icon_class}/>);
    var classNames = [this.props.class, 'k-drawer__link'];

    var link;
    if (this.props.linkto) {
      link = (
        <Link to={this.props.linkto}
            className={classNames.join(' ')}
            activeClassName='active'
            data-tip={this.props.label}>
          {icon}
        </Link>
      );
    } else {
      link = (
        <a href={this.props.href || '#'}
            className={classNames.join(' ')}
            onClick={this.onClick}
            data-tip={this.props.label}>
            {icon}
        </a>
      );
    }
    return link;
  }
}

class Drawer extends Reflux.Component {
  constructor(props){
    super(props);
    autoBind(this);
    this.state = assign(stores.session, stores.pageState);
    this.stores = [
      stores.session,
      stores.pageState,
      stores.serverEnvironment,
    ];
  }
  render () {
    const showExtraMenu=(customSession.hasAccess("forms")||customSession.hasAccess("library"))&&(this.isLibrary()||this.isForms())
    return (
      <bem.KDrawer style={{ width: showExtraMenu ? 270 : 58 }}>
        <bem.KDrawer__primaryIcons>          
          {customSession.hasAccess("forms") && <DrawerLink label={t('Projects')} linkto='/forms' ki-icon='projects' />}
          {customSession.hasAccess("library") && <DrawerLink label={t('Library')} linkto='/library' ki-icon='library' />}
          {customSession.hasAccess("users") && <DrawerLink label={t('Users')} linkto='/users' ki-icon='people' />}
          {customSession.hasAccess("organizations") && <DrawerLink label={t('Organizations')} linkto='/organizations' ki-icon='graph-settings' />}
        </bem.KDrawer__primaryIcons>
        {showExtraMenu&&
        <bem.KDrawer__sidebar>
          { this.isLibrary() && customSession.hasAccess("library")
            ? <LibrarySidebar />
              : this.isForms() && customSession.hasAccess("forms")?
                <FormSidebar />
                : <div/>
          }
        </bem.KDrawer__sidebar>
        }
        <bem.KDrawer__secondaryIcons>
          { stores.session.currentAccount &&
            <IntercomHelpBubble/>
          }
          { stores.session.currentAccount &&
            <SupportHelpBubble/>
          }
          { stores.session.currentAccount &&
            <a href={stores.session.currentAccount.projects_url}
              className='k-drawer__link'
              target='_blank'
              data-tip={t('Projects (legacy)')}
            >
              <i className='k-icon k-icon-globe' />
            </a>
          }
          { stores.serverEnvironment &&
            stores.serverEnvironment.state.source_code_url &&
            <a href={stores.serverEnvironment.state.source_code_url}
              className='k-drawer__link' target='_blank' data-tip={t('Source')}>
              <i className='k-icon k-icon-github' />
            </a>
          }
        </bem.KDrawer__secondaryIcons>
      </bem.KDrawer>
      );
  }
};

reactMixin(Drawer.prototype, searches.common);
reactMixin(Drawer.prototype, mixins.droppable);
reactMixin(Drawer.prototype, mixins.contextRouter);

Drawer.contextTypes = {
  router: PropTypes.object
};

export default Drawer;
