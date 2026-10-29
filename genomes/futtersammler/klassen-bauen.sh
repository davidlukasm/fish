#!/bin/bash
# Baut die sieben Futtersammler-Klassen (kleine Serie, Kiefer 8) mit dem Baukasten klassen-baukasten.cc.
# Aufruf: ./klassen-bauen.sh ZIELORDNER   (klassen = übersetztes klassen-baukasten.cc)
Z=${1:-.}
B="EGGPUMP=1 NOSEEGG=1 FOODNOSE=1 FWDZ=1 FWD=1"
mk() { n=$1; shift; env $B "$@" ./klassen "$Z/$n.genome"; }
mk schnapper    SMALL=1
mk siebmaul     SMALL=1 NICHE=205 PIGQ=-0.667 PIGCAP=-2
mk algenzupfer  SMALL=1 GUTQ=1 EYEGREEN=1 NICHE=335 PIGQ=0.667 PIGCAP=-2 HORM=-0.8 WAVES=2.5 LEARNMODE=2 LEARNBAND=3
mk gruendler    SMALL=1 GUTQ=0 NICHE=155 PIGQ=0.111 PIGW=0 PIGCAP=-2 HORM=-0.8 WAVES=2.5 LEARNMODE=2 LEARNBAND=3
mk blattbeisser JAW=1 JAWCAP=-2.75 JAWTEETH=0.4 GUTQ=0.6 NICHE=25 PIGQ=0.4 PIGCAP=-2
mk knacker      JAW=1 JAWCAP=-2.75 JAWTEETH=0.6 NICHE=155 PIGQ=0 PIGCAP=-2
mk geier        JAW=1 JAWCAP=-2.75 JAWTEETH=-0.3 NICHE=180 NICHELAT=40 NICHEW=0.5 PIGQ=1 PIGW=1 PIGCAP=-2
