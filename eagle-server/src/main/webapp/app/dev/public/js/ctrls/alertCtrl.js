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

(function() {
	'use strict';

	var eagleControllers = angular.module('eagleControllers');

	// ======================================================================================
	// =                                        Alert                                       =
	// ======================================================================================
	eagleControllers.controller('alertListCtrl', function ($scope, $wrapState, $interval, PageConfig, Entity) {
		PageConfig.title = "Alerts";

		$scope.alertList = Entity.queryMetadata("alerts", {size: 10000});

		// ================================================================
		// =                             Sync                             =
		// ================================================================
		var refreshInterval = $interval($scope.alertList._refresh, 1000 * 10);
		$scope.$on('$destroy', function() {
			$interval.cancel(refreshInterval);
		});
	});

	eagleControllers.controller('alertDetailCtrl', function ($scope, $wrapState, PageConfig, Entity) {
		PageConfig.title = "Alert Detail";

		$scope.alertList = Entity.queryMetadata("alerts/" + encodeURIComponent($wrapState.param.alertId));
		$scope.alertList._then(function () {
			$scope.alert = $scope.alertList[0];
			if(!$scope.alert) {
				$.dialog({
					title: "OPS",
					content: "Alert '" + $wrapState.param.alertId + "' not found!"
				});
			}
		});
	});

	// ======================================================================================
	// =                                       Stream                                       =
	// ======================================================================================
	eagleControllers.controller('alertStreamListCtrl', function ($scope, $wrapState, PageConfig, Application) {
		PageConfig.title = "Streams";

		$scope.streamList = $.map(Application.list, function (app) {
			return (app.streams || []).map(function (stream) {
				return {
					streamId: stream.streamId,
					appType: app.descriptor.type,
					siteId: app.site.siteId,
					schema: stream.schema
				};
			});
		});
	});

	// ======================================================================================
	// =                                       Policy                                       =
	// ======================================================================================
	eagleControllers.controller('policyListCtrl', function ($scope, $wrapState, PageConfig, Entity, UI) {
		PageConfig.title = "Policies";

		$scope.policyList = [];

		function updateList() {
			var list = Entity.queryMetadata("policies");
			list._then(function () {
				$scope.policyList = list;
			});
		}
		updateList();

		$scope.deletePolicy = function (item) {
			UI.deleteConfirm(item.name)(function (entity, closeFunc) {
				Entity.deleteMetadata("policies/" + item.name)._promise.finally(function () {
					closeFunc();
					updateList();
				});
			});
		};

		$scope.startPolicy = function (policy) {
			Entity
				.post("metadata/policies/" + encodeURIComponent(policy.name) + "/status/ENABLED", {})
				._then(updateList);
		};

		$scope.stopPolicy = function (policy) {
			Entity
				.post("metadata/policies/" + encodeURIComponent(policy.name) + "/status/DISABLED", {})
				._then(updateList);
		};
	});

	eagleControllers.controller('policyDetailCtrl', function ($scope, $wrapState, PageConfig, Entity, UI) {
		PageConfig.title = $wrapState.param.name;
		PageConfig.subTitle = "Detail";
		PageConfig.navPath = [
			{title: "Policy List", path: "/policies"},
			{title: "Detail"}
		];

		var policyList = Entity.queryMetadata("policies/" + encodeURIComponent($wrapState.param.name));
		policyList._promise.then(function () {
			$scope.policy = policyList[0];
			console.log("[Policy]", $scope.policy);

			if(!$scope.policy) {
				$.dialog({
					title: "OPS",
					content: "Policy '" + $wrapState.param.name + "' not found!"
				}, function () {
					$wrapState.go("policyList");
				});
			} else {
				$scope.publisherList = Entity.queryMetadata("policies/" + encodeURIComponent($scope.policy.name) + "/publishments");
			}
		});
	});
}());
