import fs from 'fs';

const core = require('@actions/core');
import {
    DOWNLOAD_DIR,
    FILE_SUFFIX,
    GARMIN_MIGRATE_NUM_DEFAULT,
    GARMIN_MIGRATE_START_DEFAULT,
    GARMIN_PASSWORD_DEFAULT,
    GARMIN_URL_DEFAULT,
    GARMIN_USERNAME_DEFAULT,
} from '../constant';
import { GarminClientType, } from './type';
import _ from 'lodash';
import {IWorkout, IWorkoutDetail, 
    IWorkoutSegment, IWorkoutStep

} from '@gooin/garmin-connect/dist/garmin/types'
import Running, {
} from '@gooin/garmin-connect/dist/garmin/workouts/Running'
const decompress = require('decompress');

const unzipper = require('unzipper');

import { getSyncConfigFromDB, saveSyncConfigToDB, updateSyncConfigToDB } from './sqlite';

/**
 * 上传 .fit file
 * @param fitFilePath
 * @param client
 */
export const uploadGarminActivity = async (fitFilePath: string, client: GarminClientType): Promise<void> => {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR);
    }
    try {
        const upload = await client.uploadActivity(fitFilePath);
        console.log('upload to garmin activity', upload);
    } catch (error) {
        console.log('upload to garmin activity error', error);
    }
};

/**
 * 下载 garmin 活动原始数据，并解压保存到本地
 * @param activityId
 * @param client GarminClientType
 */
export const downloadGarminActivity = async (activityId, client: GarminClientType): Promise<string> => {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR);
    }
    const activity = await client.getActivity({ activityId: activityId });
    await client.downloadOriginalActivityData(activity, DOWNLOAD_DIR);
    const originZipFile = DOWNLOAD_DIR + '/' + activityId + '.zip';
    const baseFilePath = `${DOWNLOAD_DIR}/`;
    const unzipped = await decompress(originZipFile, DOWNLOAD_DIR);
    const unzippedFileName = unzipped?.[0].path;
    const path = baseFilePath + unzippedFileName;
    console.log('downloadGarminActivity - path:', path)
    return path;
};

export const getGarminStatistics = async (client: GarminClientType): Promise<Record<string, any>> => {
    // Get a list of default length with most recent activities
    const acts = await client.getActivities(0, 10);
    // console.log('acts', acts);

    //  跑步 typeKey: 'running'
    //  操场跑步 typeKey: 'track_running'
    //  跑步机跑步 typeKey: 'treadmill_running'
    //  沿街跑步 typeKey: 'street_running'

    // 包含running关键字的都算
    const recentRunningAct = _.filter(acts, act => act?.activityType?.typeKey?.includes('running'))[0];
    console.log('recentRunningAct type: ', recentRunningAct.activityType?.typeKey);

    const {
        activityId, // 活动id
        activityName, // 活动名称
        startTimeLocal, // 活动开始时间
        distance, // 距离
        duration, // 时间
        averageSpeed, // 平均速度 m/s
        averageHR, // 平均心率
        maxHR, // 最大心率
        averageRunningCadenceInStepsPerMinute, // 平均每分钟步频
        aerobicTrainingEffect, // 有氧效果
        anaerobicTrainingEffect, // 无氧效果
        avgGroundContactTime, // 触地时间
        avgStrideLength, // 步幅
        vO2MaxValue, // VO2Max
        avgVerticalOscillation, // 垂直振幅
        avgVerticalRatio, // 垂直振幅比
        avgGroundContactBalance, // 触地平衡
        trainingEffectLabel, // 训练效果
        activityTrainingLoad, // 训练负荷
    } = recentRunningAct;

    const pace = 1 / (averageSpeed / 1000 * 60);
    const pace_min = Math.floor(1 / (averageSpeed / 1000 * 60));
    const pace_second = (pace - pace_min) * 60;
    // 秒数小于10前面添加0， 如01，避免谷歌表格识别不成分钟数。  5:9 -> 5:09
    const pace_second_text = pace_second < 10 ? '0' + pace_second.toFixed(0) : pace_second.toFixed(0);
    // console.log('pace', pace);
    // console.log('pace_min', pace_min);
    // console.log('pace_second', pace_second);

    return {
        activityId, // 活动id
        activityName, // 活动名称
        startTimeLocal, // 活动开始时间
        distance, // 距离
        duration, // 持续时间
        // averageSpeed 是 m/s
        averageSpeed, // 速度
        averagePace: pace,  // min/km
        averagePaceText: `${pace_min}:${pace_second_text}`,  // min/km
        averageHR, // 平均心率
        maxHR, // 最大心率
        averageRunningCadenceInStepsPerMinute, // 平均每分钟步频
        aerobicTrainingEffect, // 有氧效果
        anaerobicTrainingEffect, // 无氧效果
        avgGroundContactTime, // 触地时间
        avgStrideLength, // 步幅
        vO2MaxValue, // 最大摄氧量
        avgVerticalOscillation, // 垂直振幅
        avgVerticalRatio, // 垂直振幅比
        avgGroundContactBalance, // 触地平衡
        trainingEffectLabel, // 训练效果
        activityTrainingLoad, // 训练负荷
        activityURL: GARMIN_URL_DEFAULT.ACTIVITY_URL + activityId, // 活动链接
    };
    // const detail = await GCClient.getActivity(recentRunningAct);
    // console.log('detail', detail);
};

export const getWorkouts = async (client: GarminClientType): Promise<IWorkout[]> => {
    const workouts = client.getWorkouts(0, 100)
    return workouts
}


export const getWorkoutDetail = async (workoutId: String, client: GarminClientType): Promise<IWorkoutDetail> => {
    const workoutDetail = client.getWorkoutDetail({
        workoutId: workoutId
    })
    return workoutDetail
}

export const addWorkout = async (workout: IWorkoutDetail | Running, client: GarminClientType): Promise<IWorkoutDetail> => {
    return client.addWorkout(workout)
}

export const addRunningWorkout = async ( name: string, meters: number, description: string, client: GarminClientType): Promise<IWorkoutDetail> => {
    return client.addRunningWorkout(name, meters, description)
}


export const syncWorkouts = async(fromClient: GarminClientType, toClient: GarminClientType, fromType: "CN" | "GLOBAL"): Promise<String> => {
    try{
        let workouts: IWorkout[] = (await fromClient.getWorkouts(0, 100));
        workouts.sort((a: IWorkout, b: IWorkout) =>
        {
            if (!a.workoutId) {
                return -1
            } else if(!b.workoutId) {
                return -1
            } else if(a.workoutId > b.workoutId){
                return 1
            } else {
                return -1
            }
        })
        const syncType = "workout"
        const lastName = await getSyncConfigFromDB(fromType, syncType)

        let currentLastName = ""
        console.log(`可能需要同步课表数量: ${workouts.length},上次最后一条记录为【${lastName}】 `);
        let count = 0
        for (let workout of workouts) {
            // 遇到了相同的就中止同步
            if (workout.workoutName == lastName) {
                break;
            }
            try{
                if (!workout.workoutId) {
                    continue;
                }
                console.log(`本次开始向${fromType}区上传课表【${workout.workoutName}】 `);
                const workoutDetail = await fromClient.getWorkoutDetail({
                    workoutId: workout.workoutId
                });

                await toClient.addWorkout(workoutDetail)

                // 更新最后一条的名称
                currentLastName = workout.workoutName
                count++
            } catch {

            }
        }
        console.log(`最终同步课表数量: ${count},最后的一条记录为【${currentLastName}】 `);
        if (lastName.length > 0) {
            // 存在就更新
            updateSyncConfigToDB(fromType, syncType, currentLastName)
        } else {
            // 不存在就新增
            saveSyncConfigToDB(fromType, syncType, currentLastName)
        }

    }catch(e) {
        console.log(e);
    }
    return ""
}