import {UserDao} from '../dao/user-dao';
import {GroupDao} from '../dao/group-dao';
import {DirectoryServicesDao} from '../dao/directory-services-dao';
import {AccountSystemDao} from '../dao/account-systems-dao';
import {DirectoryserviceConfigDao} from '../dao/directoryservice-config-dao';
import {AbstractRepository} from './abstract-repository';
import {DirectoryDao} from '../dao/directory-dao';
import {Map} from 'immutable';
import {ModelEventName} from '../model-event-name';
import {Model} from '../model';
import {DatastoreService} from '../service/datastore-service';
import {Group} from '../model/Group';
import {User} from '../model/User';

import * as _ from 'lodash';
import {SubmittedTask} from '../model/SubmittedTask';

export class AccountRepository extends AbstractRepository {
    private static instance: AccountRepository;

    private users: Map<string, Map<string, any>>;
    private groups: Map<string, Map<string, any>>;
    private systemGroupsPromise: Promise<Array<Group>>;
    private systemUsersPromise: Promise<Array<User>>;
    private directories: Map<string, Map<string, any>>;
    private groupsStreamId: string;
    private usersStreamId: string;

    public static readonly DIRECTORY_TYPES_LABELS = {
        winbind: 'Active Directory',
        freeipa: 'FreeIPA',
        ldap: 'LDAP',
        nis: 'NIS'
    };

    private constructor(private userDao: UserDao,
                        private groupDao: GroupDao,
                        private datastoreService: DatastoreService,
                        private directoryServiceDao: DirectoryServicesDao,
                        private directoryserviceConfigDao: DirectoryserviceConfigDao,
                        private directoryDao: DirectoryDao,
                        private accountSystemDao: AccountSystemDao) {
        super([
            Model.User,
            Model.Group,
            Model.Directory
        ]);
    }

    public static getInstance() {
        if (!AccountRepository.instance) {
            AccountRepository.instance = new AccountRepository(
                new UserDao(),
                new GroupDao(),
                DatastoreService.getInstance(),
                new DirectoryServicesDao(),
                new DirectoryserviceConfigDao(),
                new DirectoryDao(),
                new AccountSystemDao()
            );
        }
        return AccountRepository.instance;
    }

    public loadUsers(): Promise<Array<any>> {
        return this.userDao.list();
    }

    public loadGroups(): Promise<Array<any>> {
        return this.groupDao.list();
    }

    public listSystemUsersAndGroups() {
        return Promise.all([
            this.listSystemUsers(),
            this.listSystemGroups()
        ]).spread((users: Array<any>, groups: Array<any>) => _.concat(users, groups));
    }

    //@deprecated
    public listUsers(): Promise<Array<any>> {
        return this.users ? Promise.resolve(this.users.toSet().toJS()) : this.userDao.list();
    }

    public listLocalUsers(): Promise<Array<any>> {
        return this.userDao.stream(false, {origin: {directory: 'local'}}).then((stream) => {
            return stream.get('data').toJS();;
        });
    }

    public listSystemUsers(): Promise<Array<any>> {
        if (this.systemUsersPromise) {
            return this.systemUsersPromise;
        }

        return this.systemUsersPromise = this.userDao.list(false, {builtin: true});
    }

    public streamUsers(): Promise<Array<Object>> {
        let promise;

        if (this.usersStreamId) {
            promise = Promise.resolve(
                this.datastoreService.getState().get('streams').get(this.usersStreamId)
            );
        } else {
            promise = this.userDao.stream(true, {builtin: false});
        }

        return promise.then((stream) => {
            let dataArray = stream.get('data').toJS();

            this.userDao.register();
            this.usersStreamId = stream.get('streamId');
            dataArray._objectType = this.userDao.objectType;

            // FIXME!!
            // DTM montage
            dataArray._stream = stream;

            return dataArray;
        });
    }

    public getUserEmptyList() {
        return this.userDao.getEmptyList();
    }

    public getGroupEmptyList() {
        return this.groupDao.getEmptyList();
    }

    public getDirectoryServicesEmptyList() {
        return this.directoryServiceDao.getEmptyList();
    }

    public getAccountSystemEmptyList() {
        return this.accountSystemDao.getEmptyList();
    }

    // need discussion
    public getNextSequenceForStream (streamId) {
        return this.groupDao.getNextSequenceForStream(streamId);
    }

    public findUserWithName(name: string): Promise<Object> {
        return this.userDao.findSingleEntry({username: name});
    }

    public saveUser(user: User): Promise<SubmittedTask> {
        return this.userDao.save(user);
    }

    // @deprecated
    public listGroups(): Promise<Array<Object>> {
        return this.groups ? Promise.resolve(this.groups.toSet().toJS()) : this.groupDao.list();
    }

    public listLocalGroups(): Promise<Array<Object>> {
        return this.groupDao.stream(false, {origin: {directory: 'local'}}).then((stream) => {
            return stream.get('data').toJS();;
        });
    }

    public listSystemGroups(): Promise<Array<any>> {
        if (this.systemGroupsPromise) {
            return this.systemGroupsPromise;
        }

        return this.systemGroupsPromise = this.groupDao.list(false, {builtin: true});
    }

    //TODO: ask only ids? (improvements)
    public streamGroups(): Promise<Array<Object>> {
        let promise;

        if (this.groupsStreamId) {
            promise = Promise.resolve(
                this.datastoreService.getState().get("streams").get(this.groupsStreamId)
            );
        } else {
            promise = this.groupDao.stream(true, {builtin: false});
        }

        return promise.then((stream) => {
            let dataArray = stream.get('data').toJS();

            this.groupDao.register();
            this.groupsStreamId = stream.get('streamId');
            dataArray._objectType = this.groupDao.objectType;

            // FIXME!!
            // DTM montage
            dataArray._stream = stream;

            return dataArray;
        });
    }

    public getNextUid() {
        return this.userDao.getNextUid();
    }

    public getNewUser() {
        return this.userDao.getNewInstance();
    }

    public getNewGroup() {
        return this.groupDao.getNewInstance();
    }

    public getNewDirectoryServices(): Promise<Object> {
        return this.directoryServiceDao.getNewInstance();
    }

    public getDirectoryServiceConfig(): Promise<Object> {
        return this.directoryserviceConfigDao.get();
    }

    public listDirectories(): Promise<Array<any>> {
        let promise = this.directories ? Promise.resolve(this.directories.valueSeq().toJS()) : this.directoryDao.list();
        return promise.then(directories => {
            _.forEach(directories, directory => {
                directory.label = AccountRepository.DIRECTORY_TYPES_LABELS[directory.type];
            });
            return directories;
        });
    }

    public getNewDirectoryForType(type: string) {
        return this.directoryDao.getNewInstance().then(function (directory) {
            directory.type = type;
            directory._tmpId = type;
            directory.parameters = {'%type': type + '-directory-params'};
            directory.label = AccountRepository.DIRECTORY_TYPES_LABELS[type];

            return directory;
        });
    }

    public searchUser(value) {
        return this.searchUserWithCriteria({username: [['match', value + "*"]]});
    }

    public searchGroup(value) {
        return this.searchGroupWithCriteria({name: [['match', value + "*"]]});
    }

    public searchGroupWithCriteria(criteria: any) {
        return this.groupDao.stream(false, criteria).then(function (results) {
            return results.get('data').toJS();
        });
    }

    public searchUserWithCriteria(criteria: any) {
        return this.userDao.stream(false, criteria).then(function (results) {
            return results.get('data').toJS();
        });
    }

    protected handleStateChange(name: string, state: any) {
        switch (name) {
            case Model.User:
                this.users = this.dispatchModelEvents(this.users, ModelEventName.User, state);
                break;
            case Model.Group:
                this.groups = this.dispatchModelEvents(this.groups, ModelEventName.Group, state);
                break;
            case Model.Directory:
                this.directories = this.dispatchModelEvents(this.directories, ModelEventName.Directory, state);
                break;
            default:
                break;
        }
    }

    protected handleEvent(name: string, data: any) {
    }
}


