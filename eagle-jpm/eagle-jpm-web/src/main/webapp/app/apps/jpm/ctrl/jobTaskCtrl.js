/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


(function () {
	/**
	 * `register` without params will load the module which using require
	 */
	register(function (jpmApp) {
		var TREND_INTERVAL = 60;
		var SCHEDULE_BUCKET_COUNT = 30;
		var TASK_STATUS = ["SUCCEEDED", "FAILED", "KILLED"];
		var TASK_TYPE = ["MAP", "REDUCE"];
		var DURATION_BUCKETS = [0, 30 * 1000, 60 * 1000, 120 * 1000, 300 * 1000, 600 * 1000, 1800 * 1000, 3600 * 1000, 2 * 3600 * 1000, 3 * 3600 * 1000];
		var TASK_FIELDS = [
			"rack",
			"hostname",
			"taskType",
			"taskId",
			"taskStatus",
			"startTime",
			"endTime",
			"jobCounters"
		];

		function getCommonHeatMapOption(categoryList, maxCount) {
			return {
				animation: false,
				tooltip: {
					trigger: 'item'
				},
				xAxis: {splitArea: {show: true}},
				yAxis: [{
					type: 'category',
					data: categoryList,
					splitArea: {show: true},
					axisTick: {show: false}
				}],
				grid: { bottom: "50" },
				visualMap: {
					min: 0,
					max: maxCount,
					calculable: true,
					orient: 'horizontal',
					left: 'right',
					inRange: {
						color: ["#00a65a", "#ffdc62", "#dd4b39"]
					}
				}
			};
		}

		function getCommonHeatMapSeries(name, data) {
			return {
				name: name,
				type: "heatmap",
				data: data,
				itemStyle: {
					normal: {
						borderColor: "#FFF"
					}
				}
			};
		}

		/**
		 * @typedef {{}} Task
		 * @property {string} taskStatus
		 * @property {number} startTime
		 * @property {number} endTime
		 * @property {{}} jobCounters
		 * @property {{}} jobCounters.counters
		 * @property {{}} tags
		 * @property {string} tags.taskType
		 * @property {number} _bucket
		 * @property {number} _bucketStart
		 * @property {number} _bucketEnd
		 * @property {number} _duration
		 * @property {number} _durationBucket
		 */

		jpmApp.controller("jobTaskCtrl", function ($wrapState, $scope, PageConfig, Time, JPM) {
			$scope.site = $wrapState.param.siteId;
			$scope.jobId = $wrapState.param.jobId;

			var startTime = Number($wrapState.param.startTime);
			var endTime = Number($wrapState.param.endTime);

			PageConfig.title = "(beta) Task Statistic";
			PageConfig.subTitle = $scope.jobId;

			var timeDiff = endTime - startTime;
			var timeDes = Math.ceil(timeDiff / SCHEDULE_BUCKET_COUNT);

			$scope.bucketScheduleCategory = [];
			for(var i = 0 ; i < SCHEDULE_BUCKET_COUNT ; i += 1) {
				$scope.bucketScheduleCategory.push(Time.format(startTime + i * timeDes, "HH:mm:SS") + "\n~\n" + Time.format(startTime + (i + 1) * timeDes, "HH:mm:SS"));
			}

			$scope.bucketDurationCategory = [];
			$.each(DURATION_BUCKETS, function (i, start) {
				var end = DURATION_BUCKETS[i + 1];
				if(!start) {
					$scope.bucketDurationCategory.push("<" + Time.diffStr(end));
				} else if(!end) {
					$scope.bucketDurationCategory.push(">" + Time.diffStr(start));
				} else {
					$scope.bucketDurationCategory.push(Time.diffStr(start) + "\n~\n" + Time.diffStr(end));
				}
			});

			// ============================================================================
			// ============================================================================
			// ==                               Fetch Task                               ==
			// ============================================================================
			// ============================================================================
			$scope.list = JPM.list("TaskExecutionService", {site: $scope.site, jobId: $scope.jobId}, startTime, endTime, TASK_FIELDS, 1000000);
			$scope.list._promise.then(function () {
				var i;

				// ========================= Schedule Trend =========================
				var trend_map_countList = [];
				var trend_reduce_countList = [];
				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var _task = {
							_bucketStart: Math.floor((task.startTime - startTime) / TREND_INTERVAL),
							_bucketEnd: Math.floor((task.endTime - startTime) / TREND_INTERVAL)
						};

						switch (task.tags.taskType) {
							case "MAP":
								fillBucket(trend_map_countList, _task);
								break;
							case "REDUCE":
								fillBucket(trend_reduce_countList, _task);
								break;
							default:
								console.warn("Task type not match:", task.tags.taskType, task);
						}
					});

				$scope.scheduleCategory = [];
				for(i = 0 ; i < Math.max(trend_map_countList.length, trend_reduce_countList.length) ; i += 1) {
					$scope.scheduleCategory.push(Time.format(startTime + i * TREND_INTERVAL).replace(" ", "\n"));
				}

				$scope.scheduleSeries = [{
					name: "Map Task Count",
					type: "line",
					showSymbol: false,
					areaStyle: {normal: {}},
					data: trend_map_countList
				}, {
					name: "Reduce Task Count",
					type: "line",
					showSymbol: false,
					areaStyle: {normal: {}},
					data: trend_reduce_countList
				}];

				// ======================= Bucket Distribution ======================
				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						task._bucketStart = Math.floor((task.startTime - startTime) / timeDes);
						task._bucketEnd = Math.floor((task.endTime - startTime) / timeDes);
						task._duration = task.endTime - task.startTime;
						task._durationBucket = common.number.inRange(DURATION_BUCKETS, task._duration);
					});

				// ==================================================================
				// =                      Schedule Distribution                     =
				// ==================================================================
				function fillBucket(countList, task, maxCount) {
					for(var bucketId = task._bucketStart ; bucketId <= task._bucketEnd ; bucketId += 1) {
						var count = countList[bucketId] = (countList[bucketId] || 0) + 1;
						maxCount = Math.max(maxCount, count);
					}
					return maxCount;
				}

				function getHeatMapOption(categoryList, maxCount) {
					var option = getCommonHeatMapOption(categoryList, maxCount);
					return common.merge(option, {
						tooltip: {
							formatter: function (point) {
								if(point.data) {
									return categoryList[point.data[1]] + ":<br/>" +
										'<span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:' + point.color + '"></span> ' +
										$scope.bucketScheduleCategory[point.data[0]] + ": " +
										point.data[2];
								}
								return "";
							}
						}
					});
				}

				function bucketToSeries(categoryList, buckets, name) {
					var bucket_data = $.map(categoryList, function (category, index) {
						var list = [];
						var dataList = buckets[category] || [];
						for(var i = 0 ; i < SCHEDULE_BUCKET_COUNT ; i += 1) {
							list.push([i, index, dataList[i] || 0]);
						}
						return list;
					});

					return [common.merge(getCommonHeatMapSeries(name, bucket_data), {
						label: {
							normal: {
								show: true,
								formatter: function (point) {
									if(point.data[2] === 0) return "-";
									return " ";
								}
							}
						}
					})];
				}

				// ======================== Status Statistic ========================
				var bucket_status = {};
				var bucket_status_maxCount = 0;
				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var countList = bucket_status[task.taskStatus] = (bucket_status[task.taskStatus] || []);

						bucket_status_maxCount = fillBucket(countList, task, bucket_status_maxCount);
					});

				$scope.statusSeries = bucketToSeries(TASK_STATUS, bucket_status, "Task Status");
				$scope.statusOption = getHeatMapOption(TASK_STATUS, bucket_status_maxCount);

				// ======================= Duration Statistic =======================
				var TASK_DURATION = [0, 120 * 1000, 300 * 1000, 600 * 1000, 1800 * 1000, 3600 * 1000];
				var bucket_durations = {};
				var bucket_durations_maxCount = 0;

				var TASK_DURATION_DISTRIBUTION = $.map(TASK_DURATION, function (start, i) {
					var end = TASK_DURATION[i + 1];
					if(i === 0) {
						return "<" + Time.diffStr(end);
					} else if(end) {
						return Time.diffStr(start) + "~" + Time.diffStr(end);
					}
					return ">" + Time.diffStr(start);
				});

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_DURATION_DISTRIBUTION[common.number.inRange(TASK_DURATION, task._duration)];
						var countList = bucket_durations[durationBucket] = (bucket_durations[durationBucket] || []);

						bucket_durations_maxCount = fillBucket(countList, task, bucket_durations_maxCount);
					});

				$scope.durationSeries = bucketToSeries(TASK_DURATION_DISTRIBUTION, bucket_durations, "Task Duration Distribution");
				$scope.durationOption = getHeatMapOption(TASK_DURATION_DISTRIBUTION, bucket_durations_maxCount);

				// ======================= HDFS Read Statistic ======================
				var TASK_HDFS_BYTES = [0, 5 * 1024 * 1024, 20 * 1024 * 1024, 100 * 1024 * 1024, 256 * 1024 * 1024, 1024 * 1024 * 1024];
				var bucket_hdfs_reads = {};
				var bucket_hdfs_reads_maxCount = 0;

				var TASK_HDFS_DISTRIBUTION = $.map(TASK_HDFS_BYTES, function (start, i) {
					var end = TASK_HDFS_BYTES[i + 1];
					if(i === 0) {
						return "<" + common.number.abbr(end, true);
					} else if(end) {
						return common.number.abbr(start, true) + "~" + common.number.abbr(end, true);
					}
					return ">" + common.number.abbr(start, true);
				});

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_HDFS_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].HDFS_BYTES_READ)];
						var countList = bucket_hdfs_reads[durationBucket] = (bucket_hdfs_reads[durationBucket] || []);

						bucket_hdfs_reads_maxCount = fillBucket(countList, task, bucket_hdfs_reads_maxCount);
					});

				$scope.hdfsReadSeries = bucketToSeries(TASK_HDFS_DISTRIBUTION, bucket_hdfs_reads, "Task HDFS Read Distribution");
				$scope.hdfsReadOption = getHeatMapOption(TASK_HDFS_DISTRIBUTION, bucket_hdfs_reads_maxCount);

				// ====================== HDFS Write Statistic ======================
				var bucket_hdfs_writes = {};
				var bucket_hdfs_writes_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_HDFS_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].HDFS_BYTES_WRITTEN)];
						var countList = bucket_hdfs_writes[durationBucket] = (bucket_hdfs_writes[durationBucket] || []);

						bucket_hdfs_writes_maxCount = fillBucket(countList, task, bucket_hdfs_writes_maxCount);
					});

				$scope.hdfsWriteSeries = bucketToSeries(TASK_HDFS_DISTRIBUTION, bucket_hdfs_writes, "Task HDFS Write Distribution");
				$scope.hdfsWriteOption = getHeatMapOption(TASK_HDFS_DISTRIBUTION, bucket_hdfs_writes_maxCount);

				// ====================== Local Read Statistic ======================
				var TASK_LOCAL_BYTES = [0, 20 * 1024 * 1024, 100 * 1024 * 1024, 256 * 1024 * 1024, 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024];
				var bucket_local_reads = {};
				var bucket_local_reads_maxCount = 0;

				var TASK_LOCAL_DISTRIBUTION = $.map(TASK_LOCAL_BYTES, function (start, i) {
					var end = TASK_LOCAL_BYTES[i + 1];
					if(i === 0) {
						return "<" + common.number.abbr(end, true);
					} else if(end) {
						return common.number.abbr(start, true) + "~" + common.number.abbr(end, true);
					}
					return ">" + common.number.abbr(start, true);
				});

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_LOCAL_DISTRIBUTION[common.number.inRange(TASK_LOCAL_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].FILE_BYTES_READ)];
						var countList = bucket_local_reads[durationBucket] = (bucket_local_reads[durationBucket] || []);

						bucket_local_reads_maxCount = fillBucket(countList, task, bucket_local_reads_maxCount);
					});

				$scope.localReadSeries = bucketToSeries(TASK_LOCAL_DISTRIBUTION, bucket_local_reads, "Task Local Read Distribution");
				$scope.localReadOption = getHeatMapOption(TASK_LOCAL_DISTRIBUTION, bucket_local_reads_maxCount);

				// ====================== Local Write Statistic =====================
				var bucket_local_writes = {};
				var bucket_local_writes_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_LOCAL_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].FILE_BYTES_WRITTEN)];
						var countList = bucket_local_writes[durationBucket] = (bucket_local_writes[durationBucket] || []);

						bucket_local_writes_maxCount = fillBucket(countList, task, bucket_local_writes_maxCount);
					});

				$scope.localWriteSeries = bucketToSeries(TASK_LOCAL_DISTRIBUTION, bucket_local_writes, "Task Local Write Distribution");
				$scope.localWriteOption = getHeatMapOption(TASK_LOCAL_DISTRIBUTION, bucket_local_writes_maxCount);

				// ==================================================================
				// =                      Duration Distribution                     =
				// ==================================================================
				function fillDurationBucket(countList, task, maxCount) {
					var count = countList[task._durationBucket] = (countList[task._durationBucket] || 0) + 1;
					maxCount = Math.max(maxCount, count);
					return maxCount;
				}

				function getDurationHeatMapOption(categoryList, maxCount) {
					var option = getCommonHeatMapOption(categoryList, maxCount);
					return common.merge(option, {
						tooltip: {
							formatter: function (point) {
								if(point.data) {
									return categoryList[point.data[1]] + ":<br/>" +
										'<span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:' + point.color + '"></span> ' +
										$scope.bucketDurationCategory[point.data[0]] + ": " +
										point.data[2];
								}
								return "";
							}
						}
					});
				}

				function bucketToDurationSeries(categoryList, buckets, name) {
					var bucket_data = $.map(categoryList, function (category, index) {
						var list = [];
						var dataList = buckets[category] || [];
						for(var i = 0 ; i < DURATION_BUCKETS.length ; i += 1) {
							list.push([i, index, dataList[i] || 0]);
						}
						return list;
					});

					return [common.merge(getCommonHeatMapSeries(name, bucket_data), {
						label: {
							normal: {
								show: true,
								formatter: function (point) {
									if(point.data[2] === 0) return "-";
									return point.data[2] + "";
								}
							}
						}
					})];
				}

				// ======================== Status Statistic ========================
				var duration_status = {};
				var duration_status_maxCount = 0;
				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var countList = duration_status[task.taskStatus] = (duration_status[task.taskStatus] || []);

						duration_status_maxCount = fillDurationBucket(countList, task, duration_status_maxCount);
					});

				$scope.durationStatusSeries = bucketToDurationSeries(TASK_STATUS, duration_status, "Task Status");
				$scope.durationStatusOption = getDurationHeatMapOption(TASK_STATUS, duration_status_maxCount);

				// ===================== Map / Reduce Statistic =====================
				var mapReduce_status = {};
				var mapReduce_status_maxCount = 0;
				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var countList = mapReduce_status[task.tags.taskType] = (mapReduce_status[task.tags.taskType] || []);

						mapReduce_status_maxCount = fillDurationBucket(countList, task, mapReduce_status_maxCount);
					});

				$scope.durationMapReduceSeries = bucketToDurationSeries(TASK_TYPE, mapReduce_status, "Task Type");
				$scope.durationMapReduceOption = getDurationHeatMapOption(TASK_TYPE, mapReduce_status_maxCount);

				// ======================= HDFS Read Statistic ======================
				var duration_hdfs_reads = {};
				var duration_hdfs_reads_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_HDFS_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].HDFS_BYTES_READ)];
						var countList = duration_hdfs_reads[durationBucket] = (duration_hdfs_reads[durationBucket] || []);

						duration_hdfs_reads_maxCount = fillDurationBucket(countList, task, duration_hdfs_reads_maxCount);
					});

				$scope.durationHdfsReadSeries = bucketToDurationSeries(TASK_HDFS_DISTRIBUTION, duration_hdfs_reads, "Task HDFS Read Distribution");
				$scope.durationHdfsReadOption = getDurationHeatMapOption(TASK_HDFS_DISTRIBUTION, duration_hdfs_reads_maxCount);

				// ====================== HDFS Write Statistic ======================
				var duration_hdfs_writes = {};
				var duration_hdfs_writes_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_HDFS_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].HDFS_BYTES_WRITTEN)];
						var countList = duration_hdfs_writes[durationBucket] = (duration_hdfs_writes[durationBucket] || []);

						duration_hdfs_writes_maxCount = fillDurationBucket(countList, task, duration_hdfs_writes_maxCount);
					});

				$scope.durationHdfsWriteSeries = bucketToDurationSeries(TASK_HDFS_DISTRIBUTION, duration_hdfs_writes, "Task HDFS Write Distribution");
				$scope.durationHdfsWriteOption = getDurationHeatMapOption(TASK_HDFS_DISTRIBUTION, duration_hdfs_writes_maxCount);

				// ====================== Local Read Statistic ======================
				var duration_local_reads = {};
				var duration_local_reads_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_LOCAL_DISTRIBUTION[common.number.inRange(TASK_LOCAL_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].FILE_BYTES_READ)];
						var countList = duration_local_reads[durationBucket] = (duration_local_reads[durationBucket] || []);

						duration_local_reads_maxCount = fillDurationBucket(countList, task, duration_local_reads_maxCount);
					});

				$scope.durationLocalReadSeries = bucketToDurationSeries(TASK_LOCAL_DISTRIBUTION, duration_local_reads, "Task Local Read Distribution");
				$scope.durationLocalReadOption = getDurationHeatMapOption(TASK_LOCAL_DISTRIBUTION, duration_local_reads_maxCount);

				// ====================== Local Write Statistic =====================
				var duration_local_writes = {};
				var duration_local_writes_maxCount = 0;

				$.each($scope.list,
					/**
					 * @param {number} i
					 * @param {Task} task
					 */
					function (i, task) {
						var durationBucket = TASK_LOCAL_DISTRIBUTION[common.number.inRange(TASK_HDFS_BYTES, task.jobCounters.counters["org.apache.hadoop.mapreduce.FileSystemCounter"].FILE_BYTES_WRITTEN)];
						var countList = duration_local_writes[durationBucket] = (duration_local_writes[durationBucket] || []);

						duration_local_writes_maxCount = fillDurationBucket(countList, task, duration_local_writes_maxCount);
					});

				$scope.durationLocalWriteSeries = bucketToDurationSeries(TASK_LOCAL_DISTRIBUTION, duration_local_writes, "Task Local Write Distribution");
				$scope.durationLocalWriteOption = getDurationHeatMapOption(TASK_LOCAL_DISTRIBUTION, duration_local_writes_maxCount);
			});
		});
	});
})();
