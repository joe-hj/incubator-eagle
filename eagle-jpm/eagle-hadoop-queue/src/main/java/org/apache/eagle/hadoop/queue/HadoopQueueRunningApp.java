/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.eagle.hadoop.queue;

import backtype.storm.generated.StormTopology;
import backtype.storm.topology.IRichSpout;
import backtype.storm.topology.TopologyBuilder;
import com.typesafe.config.Config;
import org.apache.eagle.app.StormApplication;
import org.apache.eagle.app.environment.impl.StormEnvironment;
import org.apache.eagle.hadoop.queue.storm.HadoopQueueMetricPersistBolt;
import org.apache.eagle.hadoop.queue.storm.HadoopQueueRunningSpout;

public class HadoopQueueRunningApp extends StormApplication {
    public StormTopology execute(Config config, StormEnvironment environment) {
        HadoopQueueRunningAppConfig appConfig = HadoopQueueRunningAppConfig.getInstance(config);

        IRichSpout spout = new HadoopQueueRunningSpout(appConfig);
        HadoopQueueMetricPersistBolt bolt = new HadoopQueueMetricPersistBolt(appConfig);
        TopologyBuilder builder = new TopologyBuilder();

        int numOfParserTasks = appConfig.topology.numOfParserTasks;
        int numOfSpoutTasks = 1;

        String spoutName = "runningQueueSpout";
        String boltName = "parserBolt";

        builder.setSpout(spoutName, spout, numOfSpoutTasks).setNumTasks(numOfSpoutTasks);
        builder.setBolt(boltName, bolt, numOfParserTasks).setNumTasks(numOfParserTasks).shuffleGrouping(spoutName);

        return builder.createTopology();
    }
}
