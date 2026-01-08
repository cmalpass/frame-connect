export {
    BaseSource,
    type PhotoInfo,
    type SourceRecord,
    type SourceConfig,
    createSource,
    registerSourceFactory,
    getSources,
    getSource,
    createSourceRecord,
    updateSourceRecord,
    deleteSourceRecord,
} from './BaseSource.js';

export { LocalFolderSource, type LocalFolderConfig } from './LocalFolderSource.js';
export { GooglePhotosSource, type GooglePhotosConfig } from './GooglePhotosSource.js';
