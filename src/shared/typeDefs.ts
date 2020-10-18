import { Field } from 'jsforce/describe-result';

// import {Field } from '@'
interface User extends Record {
    Username?: string;
}

interface ContentVersion extends Record {
    Title: string;
    FileExtension: string;
    VersionData: string;
    ContentDocumentId?: string;
}

interface ContentDocument extends Record {
    LatestPublishedVersionId: string;
}

interface ContentVersionCreateRequest {
    PathOnClient: string;
    Title?: string;
}

interface FieldMeta {
    label: string;
    // tslint:disable-next-line:no-reserved-keywords
    type: string;
    fullName: string;
    defaultValue?: string;
    description?: string;
    inlineHelpText?: string;
    required?: boolean;
    unique?: boolean;
    externalId?: boolean;
    length?: number;
    scale?: number;
    precision?: number;
    relationshipLabel?: string;
    relationshipName?: string;
    referenceTo?: string;
    trackHistory?: boolean;
    visibleLines?: number;
    valueSet?: { valueSetDefinition?: ValueSetDefinition };
}

interface ValueSetDefinition {
    sorted: boolean;
    value: Value[];
}

interface Value {
    fullName: string;
    default?: boolean;
    label: string;
}

interface ObjectConfig {
    deploymentStatus: string;
    label: string;
    pluralLabel: string;
    indexes?: unknown;
    eventType?: string;
    description?: string;
    nameField?: {
        label: string;
        type: string;
        displayFormat?: string;
    };
    sharingModel?: string;
    enableActivities?: boolean;
    enableBulkApi?: boolean;
    enableFeeds?: boolean;
    enableHistory?: boolean;
    enableReports?: boolean;
    enableSearch?: boolean;
    enableSharing?: boolean;
    enableStreamingApi?: boolean;
}

interface Record {
    attributes: unknown;
    Id: string;

    Name?: string;

    ContentDocumentId?: string;

    LiveAgentChatUrl?: string;
    LiveAgentContentUrl?: string;
}

interface QueryResult {
    totalSize: number;
    done: boolean;
    records: Record[];
}

interface CreateResult {
    id: string;
    success: boolean;
    errors: string[];
    name: string;
    message: string;
}

interface CustomLabel {
    fullName: string;
    value: string;
    protected: boolean;
    categories?: string;
    shortDescription?: string;
    language?: string;
}

interface WaveDataset {
    name: string;
    currentVersionId: string;
    createdBy: {
        name: string;
    };
    datasetType: string;
    id: string;
}

interface WaveDatasetVersion {
    xmdMain: {
        dates: [
            {
                alias: string;
                fields: {
                    fullField: string;
                };
            }
        ];
        dimensions: [
            {
                field: string;
            }
        ];
        measures: [
            {
                field: string;
            }
        ];
    };
}

interface WaveDataFlow {
    name: string;
    createdBy: {
        name: string;
    };
    type: string;
    id: string;
    label: string;
    url: string;
}

interface WaveDataFlowListResponse {
    dataflows: WaveDataFlow[];
}

interface WaveDataSetListResponse {
    datasets: WaveDataset[];
}

interface CDCEvent extends PlatformEvent {
    payload: {
        ChangeEventHeader: {
            entityName: string;
            changeType: string;
            recordIds: string[];
        };
    };
}

interface PlatformEvent {
    schema: string;
    payload: unknown;
    event: {
        replayId: number;
    };
    channel: string;
}

interface CommunitiesRestResult {
    communities: [
        {
            name: string;
            id: string;
            siteAsContainerEnabled: boolean;
        }
    ];
}

interface ToolingAPIDescribeQueryResult {
    totalSize: number;
    done: boolean;
    records: Field[];
}

interface PackageInstallRequest extends Record {
  IsDeleted: boolean;
  CreatedDate: string;
  CreatedById: string;
  LastModifiedDate: string;
  LastModifiedById: string;
  SystemModstamp: string;
  SubscriberPackageVersionKey: string;
  NameConflictResolution: string;
  SecurityType: string;
  PackageInstallSource: string;
  ProfileMappings: string;
  Password: string;
  EnableRss: boolean;
  UpgradeType: string;
  ApexCompileType: string;
  Status: string;
  Errors: string;
}

interface SObjectBasedAPICallResult<T> {
  status: number;
  result: T;
}

export {
    Record,
    ContentVersion,
    ContentDocument,
    QueryResult,
    CreateResult,
    CustomLabel,
    WaveDataSetListResponse,
    WaveDatasetVersion,
    CDCEvent,
    WaveDataFlowListResponse,
    CommunitiesRestResult,
    ToolingAPIDescribeQueryResult,
    PlatformEvent,
    ObjectConfig,
    FieldMeta,
    ContentVersionCreateRequest,
    User,
    PackageInstallRequest,
    SObjectBasedAPICallResult
};
