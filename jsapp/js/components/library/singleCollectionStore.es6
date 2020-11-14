import _ from 'underscore';
import Reflux from 'reflux';
import {hashHistory} from 'react-router';
import {
  SEARCH_CONTEXTS,
  searchBoxStore
} from '../header/searchBoxStore';
import assetUtils from 'js/assetUtils';
import {
  isOnLibraryRoute,
  getCurrentCollectionUID
} from './libraryUtils';
import {actions} from 'js/actions';
import {
  ORDER_DIRECTIONS,
  ASSETS_TABLE_COLUMNS
} from './assetsTable';

// Mostly copied from `myLibraryStore`, so far only small changes made to get
// collection assets to display in table
const singleCollectionStore = Reflux.createStore({
  /**
   * A method for aborting current XHR fetch request.
   * It doesn't need to be defined upfront, but I'm adding it here for clarity.
   */
  abortFetchData: undefined,
  previousPath: null,
  previousSearchPhrase: searchBoxStore.getSearchPhrase(),
  PAGE_SIZE: 100,
  DEFAULT_ORDER_COLUMN: ASSETS_TABLE_COLUMNS.get('date-modified'),

  isVirgin: true,

  data: {
    isFetchingData: false,
    currentPage: 0,
    totalPages: null,
    totalUserAssets: null,
    totalSearchAssets: null,
    assets: [],
    metadata: {}
  },

  init() {
    this.fetchDataDebounced = _.debounce(this.fetchData.bind(true), 2500);

    this.setDefaultColumns();

    hashHistory.listen(this.onRouteChange.bind(this));
    searchBoxStore.listen(this.searchBoxStoreChanged);
    actions.library.moveToCollection.completed.listen(this.onMoveToCollectionCompleted);
    actions.library.subscribeToCollection.completed.listen(this.fetchData.bind(this, true));
    actions.library.unsubscribeFromCollection.completed.listen(this.fetchData.bind(this, true));
    actions.library.searchMyLibraryMetadata.completed.listen(this.onSearchMetadataCmpleted);
    actions.resources.loadAsset.completed.listen(this.onAssetChanged);
    actions.resources.updateAsset.completed.listen(this.onAssetChanged);
    actions.resources.cloneAsset.completed.listen(this.onAssetCreated);
    actions.resources.createResource.completed.listen(this.onAssetCreated);
    actions.resources.deleteAsset.completed.listen(this.onDeleteAssetCompleted);
    // These are the changed requests, not all have been updated yet. Trying to
    // just get assets to show up first
    actions.library.searchMyCollectionAssets.started.listen(this.onSearchStarted);
    actions.library.searchMyCollectionAssets.completed.listen(this.onSearchCompleted);
    actions.library.searchMyCollectionAssets.failed.listen(this.onSearchFailed);
    // TODO Improve reaction to uploads being finished after task is done:
    // https://github.com/kobotoolbox/kpi/issues/476
    actions.resources.createImport.completed.listen(this.fetchDataDebounced);

    // startup store after config is ready
    actions.permissions.getConfig.completed.listen(this.startupStore);
  },

  /**
   * Only makes a call to BE when loaded app on a library route
   * otherwise wait until route changes to a library (see `onRouteChange`)
   */
  startupStore() {
    if (this.isVirgin && isOnLibraryRoute() && !this.data.isFetchingData) {
      this.fetchData(true);
    }
  },

  setDefaultColumns() {
    this.data.orderColumnId = this.DEFAULT_ORDER_COLUMN.id;
    this.data.orderValue = this.DEFAULT_ORDER_COLUMN.defaultValue;
    this.data.filterColumnId = null;
    this.data.filterValue = null;
  },

  // methods for handling search and data fetch

  /**
   * @return {object} search params shared by all searches
   */
  getSearchParams() {
    const params = {
      searchPhrase: searchBoxStore.getSearchPhrase(),
      pageSize: this.PAGE_SIZE,
      page: this.data.currentPage,
      uid: getCurrentCollectionUID() // TODO a better way to get UID through listeners?
    };

    if (this.data.filterColumnId !== null) {
      const filterColumn = ASSETS_TABLE_COLUMNS.get(this.data.filterColumnId);
      params.filterProperty = filterColumn.filterBy;
      params.filterValue = this.data.filterValue;
    }

    return params;
  },

  /**** Same code as `myLibraryStore` after this point ****/

  fetchMetadata() {
    actions.library.searchMyLibraryMetadata(this.getSearchParams());
  },

  /**
   * @param {boolean} needsMetadata
   */
  fetchData(needsMetadata = false) {
    if (this.abortFetchData) {
      this.abortFetchData();
    }

    const params = this.getSearchParams();

    params.metadata = needsMetadata;

    const orderColumn = ASSETS_TABLE_COLUMNS.get(this.data.orderColumnId);
    const direction = this.data.orderValue === ORDER_DIRECTIONS.get('ascending') ? '' : '-';
    params.ordering = `${direction}${orderColumn.orderBy}`;

    actions.library.searchMyCollectionAssets(params);
  },

  onRouteChange(data) {
    if (this.isVirgin && isOnLibraryRoute() && !this.data.isFetchingData) {
      this.fetchData(true);
    } else if (
      this.previousPath !== null &&
      (
        // coming from outside of library
        this.previousPath.split('/')[1] !== 'library' ||
        // public-collections is a special case that is kinda in library, but
        // actually outside of it
        this.previousPath.startsWith('/library/public-collections')
      ) &&
      isOnLibraryRoute()
    ) {
      // refresh data when navigating into library from other place
      this.setDefaultColumns();
      this.fetchData(true);
    }
    this.previousPath = data.pathname;
  },

  searchBoxStoreChanged() {
    if (
      searchBoxStore.getContext() === SEARCH_CONTEXTS.get('my-library') &&
      searchBoxStore.getSearchPhrase() !== this.previousSearchPhrase
    ) {
      // reset to first page when search changes
      this.data.currentPage = 0;
      this.data.totalPages = null;
      this.data.totalSearchAssets = null;
      this.previousSearchPhrase = searchBoxStore.getSearchPhrase();
      this.fetchData(true);
    }
  },

  onSearchStarted(abort) {
    this.abortFetchData = abort;
    this.data.isFetchingData = true;
    this.trigger(this.data);
  },

  onSearchCompleted(response) {
    delete this.abortFetchData;
    this.data.totalPages = Math.ceil(response.count / this.PAGE_SIZE);
    this.data.assets = response.results;
    // if we didn't fetch metadata, we assume it didn't change so leave current one
    if (response.metadata) {
      this.data.metadata = response.metadata;
    }
    this.data.totalSearchAssets = response.count;
    // update total count for the first time and the ones that will get a full count
    if (this.data.totalUserAssets === null || searchBoxStore.getSearchPhrase() === '') {
      this.data.totalUserAssets = this.data.totalSearchAssets;
    }
    this.data.isFetchingData = false;
    this.isVirgin = false;
    this.trigger(this.data);
  },

  onSearchFailed() {
    delete this.abortFetchData;
    this.data.isFetchingData = false;
    this.trigger(this.data);
  },

  onSearchMetadataCompleted(response) {
    this.data.metadata = response;
    this.trigger(this.data);
  },

  // methods for handling actions that update assets

  onMoveToCollectionCompleted(asset) {
    if (assetUtils.isLibraryAsset(asset.asset_type)) {
      // update total root assets after moving asset into/out of collection
      if (asset.parent === null) {
        this.data.totalUserAssets++;
      } else {
        this.data.totalUserAssets--;
      }
      this.fetchData(true);
    }
  },

  onAssetChanged(asset) {
    if (
      assetUtils.isLibraryAsset(asset.asset_type) &&
      this.data.assets.length !== 0
    ) {
      let wasUpdated = false;
      for (let i = 0; i < this.data.assets.length; i++) {
        const loopAsset = this.data.assets[i];
        if (
          loopAsset.uid === asset.uid &&
          (
            // if the changed asset didn't change (e.g. was just loaded)
            // let's not cause it to fetchMetadata
            loopAsset.date_modified !== asset.date_modified ||
            loopAsset.version_id !== asset.version_id
          )
        ) {
          this.data.assets[i] = asset;
          wasUpdated = true;
          break;
        }
      }
      if (wasUpdated) {
        this.trigger(this.data);
        this.fetchMetadata();
      }
    }
  },

  onAssetCreated(asset) {
    if (
      assetUtils.isLibraryAsset(asset.asset_type) &&
      asset.parent === null
    ) {
      this.data.totalUserAssets++;
      this.fetchData(true);
    }
  },

  onDeleteAssetCompleted({uid, assetType}) {
    if (assetUtils.isLibraryAsset(assetType)) {
      const found = this.findAsset(uid);
      if (found) {
        this.data.totalUserAssets--;
        this.fetchData(true);
      }
      // if not found it is possible it is on other page of results, but it is
      // not important enough to do a data fetch
    }
  },

  // public methods

  setCurrentPage(newCurrentPage) {
    this.data.currentPage = newCurrentPage;
    this.fetchData();
  },

  /**
   * @param {string} orderColumnId
   * @param {string} orderValue
   */
  setOrder(orderColumnId, orderValue) {
    if (
      this.data.orderColumnId !== orderColumnId ||
      this.data.orderValue !== orderValue
    ) {
      this.data.orderColumnId = orderColumnId;
      this.data.orderValue = orderValue;
      this.fetchData();
    }
  },

  /**
   * @param {string|null} filterColumnId - pass null to clear filter column
   * @param {string} filterValue - pass null to clear filter column
   */
  setFilter(filterColumnId, filterValue) {
    if (
      this.data.filterColumnId !== filterColumnId ||
      this.data.filterValue !== filterValue
    ) {
      this.data.filterColumnId = filterColumnId;
      this.data.filterValue = filterValue;
      this.fetchData(true);
    }
  },

  resetOrderAndFilter() {
    this.setDefaultColumns();
    this.fetchData(true);
  },

  hasAllDefaultValues() {
    return (
      this.data.orderColumnId === this.DEFAULT_ORDER_COLUMN.id &&
      this.data.orderValue === this.DEFAULT_ORDER_COLUMN.defaultValue &&
      this.data.filterColumnId === null &&
      this.data.filterValue === null
    );
  },

  getCurrentUserTotalAssets() {
    return this.data.totalUserAssets;
  },

  findAsset(uid) {
    return this.data.assets.find((asset) => {return asset.uid === uid;});
  }
});

export default singleCollectionStore;