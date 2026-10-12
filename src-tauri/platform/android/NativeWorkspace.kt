package cn.yhsun.md

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.MotionEvent
import android.graphics.Typeface
import android.widget.*
import androidx.appcompat.app.AlertDialog
import com.google.android.material.checkbox.MaterialCheckBox
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Recycled file cards and lazily expanded native settings; no WebView UI duplication. */
object NativeWorkspace : android.app.Application.ActivityLifecycleCallbacks {
    private var application:android.app.Application?=null
    private var owner=WeakReference<Activity>(null)
    private var home: Home?=null
    private var toolbar:LinearLayout?=null
    private var toolbarSignature=""
    private var setting: AlertDialog?=null
    private var more: AlertDialog?=null
    private val groups=mutableMapOf<String,Boolean>()
    private var homeSignature=""
    private var settingsSignature=""
    private var menuSignature=""
    private var epoch=0L
    private var dark=false
    private var paletteSignature=""
    private var lastToast=0L
    private fun emit(activity:Activity,kind:String,values:Map<String,Any?> = emptyMap()) {
        val data=JSONObject().put("kind",kind).put("epoch",epoch);values.forEach { (key,value)->data.put(key,value) };NativeNavigation.emit(activity,data)
    }
    private fun vertical(context:Context)=LinearLayout(context).apply { orientation=LinearLayout.VERTICAL }
    private fun row(context:Context)=LinearLayout(context).apply { orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL }
    private fun padding(view:View,size:Int=16) { val p=NativeMaterial.dp(view.context,size);view.setPadding(p,p,p,p) }
    fun update(activity:Activity,model:JSONObject):Boolean {
        if(owner.get()!==activity){application?.unregisterActivityLifecycleCallbacks(this);application=activity.application;application!!.registerActivityLifecycleCallbacks(this)}
        val newEpoch=model.optLong("epoch")
        if(owner.get()!==activity || dark!=model.optBoolean("night") || epoch!=newEpoch || paletteSignature!=model.optString("palette")) {
            close();owner=WeakReference(activity);dark=model.optBoolean("night");epoch=newEpoch;paletteSignature=model.optString("palette")
        }
        NativeMaterial.configure(dark,model.optString("palette"))
        val toolbarReady=updateToolbar(activity,model.optJSONObject("toolbar"))
        val homeModel=model.optJSONObject("home")
        if(homeModel==null){home?.hide()}
        else {if(home==null){home=Home(activity,NativeMaterial.context(activity,dark));homeSignature=""};if(homeSignature!=homeModel.toString()){home!!.update(homeModel);homeSignature=homeModel.toString()};home!!.show()}
        val config=model.optJSONObject("settings")
        if(config==null){setting?.dismiss();setting=null;settingsSignature="";groups.clear()}
        else if(settingsSchema(config)!=settingsSignature || setting?.isShowing!=true) {
            // Text input events do not rebuild the form; dependent controls refresh on change.
            val oldScroll=setting?.window?.decorView?.findViewWithTag<ScrollView>("settings-scroll")?.scrollY ?: 0
            setting?.setOnCancelListener(null);setting?.dismiss();settingsSignature=settingsSchema(config)
            setting=settings(activity,config,oldScroll);setting!!.show()
        }
        val menu=model.optJSONObject("more")
        if(menu==null){more?.setOnDismissListener(null);more?.setOnCancelListener(null);more?.dismiss();more=null;menuSignature=""}
        else if(menu.toString()!=menuSignature){more?.setOnDismissListener(null);more?.dismiss();menuSignature=menu.toString();more=menu(activity,menu);more!!.show()}
        val toast=model.optJSONObject("toast")
        if(toast!=null && toast.optLong("id")!=lastToast){lastToast=toast.optLong("id");Toast.makeText(activity,toast.optString("message"),Toast.LENGTH_SHORT).show()}
        return toolbarReady
    }
    fun close() {(toolbar?.parent as? ViewGroup)?.removeView(toolbar);toolbar=null;toolbarSignature="";home?.dismiss();setting?.setOnCancelListener(null);setting?.dismiss();more?.setOnDismissListener(null);more?.setOnCancelListener(null);more?.dismiss();home=null;setting=null;more=null;settingsSignature="";menuSignature=""}

    override fun onActivityDestroyed(activity:Activity){if(owner.get()===activity){NativeNavigation.reset();close();application?.unregisterActivityLifecycleCallbacks(this);application=null;owner=WeakReference(null)}}
    override fun onActivityCreated(activity:Activity,state:Bundle?){}
    override fun onActivityStarted(activity:Activity){}
    override fun onActivityResumed(activity:Activity){}
    override fun onActivityPaused(activity:Activity){}
    override fun onActivityStopped(activity:Activity){}
    override fun onActivitySaveInstanceState(activity:Activity,state:Bundle){}

    private fun settingsSchema(value:JSONObject):String {
        val copy=JSONObject(value.toString())
        fun clean(node:JSONObject) {
            if(node.optString("type")=="input")node.remove("value")
            val children=node.optJSONArray("children") ?: return
            for(index in 0 until children.length())clean(children.getJSONObject(index))
        }
        clean(copy);return copy.toString()
    }

    private fun updateToolbar(activity:Activity,model:JSONObject?):Boolean {
        if(model==null){toolbar?.visibility=View.GONE;return false}
        val host=activity.findViewById<ViewGroup>(android.R.id.content) ?: return false
        if(host !is FrameLayout)return false
        if(toolbar==null){toolbar=row(NativeMaterial.context(activity,dark));host.addView(toolbar,FrameLayout.LayoutParams(-1,NativeMaterial.dp(activity,model.optInt("height",54)),Gravity.TOP))}
        val bar=toolbar!!;bar.visibility=View.VISIBLE
        if(toolbarSignature!=model.toString()) {
            toolbarSignature=model.toString();bar.removeAllViews();bar.setBackgroundColor(NativeMaterial.surface);bar.elevation=NativeMaterial.dp(activity,2).toFloat()
            bar.setPadding(NativeMaterial.dp(activity,6),0,NativeMaterial.dp(activity,6),0)
            val buttons=model.optJSONArray("buttons") ?: JSONArray()
            fun action(index:Int) {
                val data=buttons.optJSONObject(index) ?: return
                val glyph=when(data.optString("id")){"mobileFileBtn"->"\ue2c8";"mobileSettingsBtn"->"\ue8b8";"modeToggle"->if(dark)"\ue518" else "\ue51c";"mobileUndoBtn"->"\ue166";"mobileRedoBtn"->"\ue15a";else->"\ue5d4"}
                bar.addView(NativeMaterial.icon(bar.context,glyph,data.optString("label")){emit(activity,"toolbar",mapOf("key" to data.optString("key")))}.apply {
                    isEnabled=!data.optBoolean("disabled");alpha=if(isEnabled)1f else .35f;textSize=20f;background=NativeMaterial.ripple(context,NativeMaterial.container,12)
                },LinearLayout.LayoutParams(NativeMaterial.dp(activity,36),NativeMaterial.dp(activity,36)).apply {setMargins(NativeMaterial.dp(activity,2),0,NativeMaterial.dp(activity,2),0)})
            }
            for(index in 0 until minOf(3,buttons.length()))action(index)
            bar.addView(NativeMaterial.label(bar.context,model.optString("title"),14f).apply {gravity=Gravity.CENTER;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;setTypeface(typeface,Typeface.BOLD);setPadding(4,0,4,0)},LinearLayout.LayoutParams(0,-1,1f))
            model.optJSONObject("lock")?.let {lock->bar.addView(NativeMaterial.icon(bar.context,"\ue897",lock.optString("label")){emit(activity,"toolbar",mapOf("key" to lock.optString("key")))}.apply {textSize=16f;setTextColor(NativeMaterial.primary)},LinearLayout.LayoutParams(NativeMaterial.dp(activity,24),NativeMaterial.dp(activity,36)))}
            for(index in 3 until buttons.length())action(index)
        }
        bar.bringToFront();return true
    }

    private class Home(private val activity:Activity,context:Context):Dialog(context) {
        private val root=vertical(context)
        private val title=NativeMaterial.label(context,"EasyPocketMD",24f)
        // A plain search field has a single placeholder, never a floating duplicate label.
        private val search=EditText(context).apply {
            hint="搜索文件";textSize=16f;setTextColor(NativeMaterial.text);setHintTextColor(NativeMaterial.muted);setSingleLine(true)
            inputType=InputType.TYPE_CLASS_TEXT;imeOptions=android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
            background=NativeMaterial.background(context,NativeMaterial.container,24)
            setPadding(NativeMaterial.dp(context,16),0,NativeMaterial.dp(context,16),0)
            if(android.os.Build.VERSION.SDK_INT>=26)importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
        }
        private val tabs=LinearLayout(context)
        private val tabScroll=HorizontalScrollView(context).apply { isHorizontalScrollBarEnabled=false;addView(tabs) }
        private val list=ListView(context).apply { divider=null;dividerHeight=0;clipToPadding=false;setPadding(0,0,0,NativeMaterial.dp(context,100)) }
        private val footer=vertical(context)
        private val placeholder=vertical(context).apply {gravity=Gravity.CENTER}
        private val empty=NativeMaterial.label(context,"",16f).apply {gravity=Gravity.CENTER}
        private val progress=com.google.android.material.progressindicator.CircularProgressIndicator(context).apply {isIndeterminate=true;setIndicatorColor(NativeMaterial.primary)}
        private val frame=FrameLayout(context)
        private var model=JSONObject()
        private var applying=false
        private var records=JSONArray()
        private val adapter=object:BaseAdapter() {
            override fun getCount()=(records.length()+1)/2
            override fun getItem(position:Int)=records.optJSONObject(position*2)
            override fun getItemId(position:Int)=position.toLong()
            override fun getView(position:Int,convertView:View?,parent:ViewGroup):View {
                val pair=(convertView as? LinearLayout) ?: row(context)
                pair.removeAllViews()
                for(column in 0..1) {
                    val record=records.optJSONObject(position*2+column)
                    if(record==null){pair.addView(View(context),LinearLayout.LayoutParams(0,NativeMaterial.dp(context,224),1f));continue}
                    val card=vertical(context);card.setPadding(NativeMaterial.dp(context,16),NativeMaterial.dp(context,20),NativeMaterial.dp(context,16),NativeMaterial.dp(context,18))
                    card.background=NativeMaterial.ripple(context,if(record.optBoolean("selected"))NativeMaterial.selected else NativeMaterial.container,20,record.optBoolean("selected"))
                    val name=NativeMaterial.label(context,record.optString("name"),17f).apply {maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;setTypeface(typeface,android.graphics.Typeface.BOLD)}
                    val heading=row(context);heading.addView(name,LinearLayout.LayoutParams(0,-2,1f))
                    if(record.optBoolean("pinned"))heading.addView(NativeMaterial.icon(context,"\uf10d","置顶"){}.apply {textSize=16f;isClickable=false;isFocusable=false},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    if(record.optBoolean("locked"))heading.addView(NativeMaterial.icon(context,"\ue897","加密"){}.apply {textSize=16f;isClickable=false;isFocusable=false},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    val status=record.optString("status")
                    if(status.isNotBlank())heading.addView(NativeMaterial.icon(context,if(status=="synced")"\ue86c" else if(status=="conflict")"\ue002" else "\ue2bd",status) {
                        if(status=="conflict")emit(activity,"home-action",mapOf("action" to "conflict","id" to record.optString("id")))
                    }.apply {textSize=16f;isClickable=status=="conflict";setTextColor(if(status=="synced")Color.rgb(70,157,91) else NativeMaterial.muted)},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    card.addView(heading)
                    if(record.optBoolean("local"))card.addView(NativeMaterial.label(context,if(model.optBoolean("english"))"Local" else "本地",11f).apply {setTextColor(NativeMaterial.primary)})
                    card.addView(NativeMaterial.label(context,if(record.optString("type")=="folder")if(model.optBoolean("english"))"Folder" else "文件夹" else record.optString("preview"),14f).apply {setTextColor(NativeMaterial.muted);maxLines=4;setLineSpacing(0f,1.65f);setPadding(0,NativeMaterial.dp(context,4),0,NativeMaterial.dp(context,12));ellipsize=android.text.TextUtils.TruncateAt.END},LinearLayout.LayoutParams(-1,0,1f))
                    card.addView(NativeMaterial.label(context,record.optString("date"),12f).apply {setTextColor(NativeMaterial.muted);maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END})
                    card.setOnClickListener {emit(activity,"file",mapOf("id" to record.optString("id")))}
                    card.setOnLongClickListener {emit(activity,"file",mapOf("id" to record.optString("id"),"longPress" to true));true}
                    pair.addView(card,LinearLayout.LayoutParams(0,NativeMaterial.dp(context,224),1f).apply {setMargins(if(column==0)0 else NativeMaterial.dp(context,7),0,if(column==0)NativeMaterial.dp(context,7) else 0,NativeMaterial.dp(context,14))})
                }
                return pair
            }
        }
        init {
            window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
            root.isFocusableInTouchMode=true;root.requestFocus()
            root.setBackgroundColor(NativeMaterial.surface)
            root.setPadding(NativeMaterial.dp(context,16),NativeMaterial.dp(context,12),NativeMaterial.dp(context,16),0)
            title.maxLines=1;title.ellipsize=android.text.TextUtils.TruncateAt.END;title.setTypeface(title.typeface,Typeface.BOLD)
            val header=row(context);header.addView(title,LinearLayout.LayoutParams(0,-2,1f))
            header.addView(NativeMaterial.icon(context,"\ue8b8","设置"){emit(activity,"home-action",mapOf("action" to "settings"))},LinearLayout.LayoutParams(NativeMaterial.dp(context,36),NativeMaterial.dp(context,36)))
            header.addView(NativeMaterial.icon(context,"\ue853","登录与账户管理"){emit(activity,"home-action",mapOf("action" to "account"))},LinearLayout.LayoutParams(NativeMaterial.dp(context,36),NativeMaterial.dp(context,36)).apply {leftMargin=NativeMaterial.dp(context,8)})
            root.addView(header,LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,36)).apply {bottomMargin=NativeMaterial.dp(context,12)})
            root.addView(search,LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,44)))
            tabs.gravity=Gravity.CENTER_VERTICAL;tabs.setPadding(0,NativeMaterial.dp(context,12),0,NativeMaterial.dp(context,12));root.addView(tabScroll)
            list.setOnScrollListener(object:AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view:AbsListView?,state:Int){}
                override fun onScroll(view:AbsListView?,first:Int,count:Int,total:Int){emit(activity,"viewport",mapOf("limit" to (first+count)*2+16))}
            })
            list.adapter=adapter;root.addView(list,LinearLayout.LayoutParams(-1,0,1f));placeholder.addView(progress);placeholder.addView(empty);root.addView(placeholder,LinearLayout.LayoutParams(-1,0,1f));list.emptyView=placeholder;root.addView(footer)
            frame.addView(root,FrameLayout.LayoutParams(-1,-1))
            val create=NativeMaterial.icon(context,"\ue145","新建") {emit(activity,"home-action",mapOf("action" to "create"))}
            create.setTextColor(Color.WHITE);create.background=NativeMaterial.ripple(context,NativeMaterial.primary,28)
            frame.addView(create,FrameLayout.LayoutParams(NativeMaterial.dp(context,56),NativeMaterial.dp(context,56),Gravity.END or Gravity.BOTTOM).apply {setMargins(0,0,NativeMaterial.dp(context,20),NativeMaterial.dp(context,24))});create.tag="create"
            setContentView(frame);setCanceledOnTouchOutside(false)
            search.addTextChangedListener(object:TextWatcher {
                override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){if(!applying)emit(activity,"filter",mapOf("folder" to model.opt("folder").takeUnless {it==JSONObject.NULL},"query" to s.toString()))}
                override fun afterTextChanged(s:Editable?){}
            })
        }
        override fun onStart(){super.onStart();window?.setBackgroundDrawableResource(android.R.color.transparent);window?.setLayout(-1,-1);NativeNavigation.dialogBack(this){onBackPressed()}}
        @Deprecated("Compat Back dispatch") override fun onBackPressed() {
            if(model.optBoolean("selecting")){emit(activity,"home-action",mapOf("action" to "cancel"));return}
            if(!model.isNull("folder")){emit(activity,"filter",mapOf("folder" to null,"query" to ""));return}
            NativeNavigation.back(activity)
        }
        private var touchX=0f
        private var touchY=0f
        private var swiping=false
        private var canSwipe=false
        override fun dispatchTouchEvent(event:MotionEvent):Boolean {
            if(event.actionMasked==MotionEvent.ACTION_DOWN) {
                touchX=event.x;touchY=event.y;swiping=false
                val location=IntArray(2);list.getLocationInWindow(location)
                canSwipe=!model.optBoolean("selecting") && event.y>=location[1] && event.y<location[1]+list.height
            }
            if(event.pointerCount>1)canSwipe=false
            if(canSwipe && !swiping && event.actionMasked==MotionEvent.ACTION_MOVE) {
                val dx=event.x-touchX;val dy=event.y-touchY
                if(kotlin.math.abs(dy)>NativeMaterial.dp(context,24) && kotlin.math.abs(dy)>kotlin.math.abs(dx))canSwipe=false
                if(kotlin.math.abs(dx)>NativeMaterial.dp(context,56) && kotlin.math.abs(dx)>kotlin.math.abs(dy)*1.5f) {
                    val cancel=MotionEvent.obtain(event);cancel.action=MotionEvent.ACTION_CANCEL;super.dispatchTouchEvent(cancel);cancel.recycle();swiping=true
                    val paths=mutableListOf<String?>(null);val folders=model.optJSONArray("folders") ?: JSONArray()
                    for(index in 0 until folders.length())paths.add(folders.getJSONObject(index).optString("name"))
                    val current=model.opt("folder").takeUnless {it==JSONObject.NULL} as? String
                    val next=paths.indexOf(current)+(if(dx<0)1 else -1)
                    if(next in paths.indices)emit(activity,"filter",mapOf("folder" to paths[next],"query" to model.optString("query")))
                }
            }
            if(swiping)return true
            return super.dispatchTouchEvent(event)
        }
        fun update(value:JSONObject) {
            val filterChanged=model.optString("folder")!=value.optString("folder") || model.optString("query")!=value.optString("query")
            model=value;applying=true
            progress.visibility=if(model.optBoolean("loading"))View.VISIBLE else View.GONE
            empty.text=if(model.optBoolean("loading"))if(model.optBoolean("english"))"Loading files…" else "正在加载文件…" else if(model.optString("query").isNotBlank())if(model.optBoolean("english"))"No results" else "没有搜索结果" else if(model.optBoolean("english"))"No files yet" else "还没有文件"
            val query=model.optString("query");if(search.text.toString()!=query){search.setText(query);search.setSelection(query.length)}
            search.hint=if(model.optBoolean("english"))"Search files" else "搜索文件"
            applying=false;val left=tabScroll.scrollX;tabs.removeAllViews();var activeTab:View?=null
            fun tab(name:String,path:String?,pinned:Boolean=false,id:String?=null){val button=NativeMaterial.button(context,name);
                if(pinned){button.icon=NativeMaterial.drawable(context,"\uf10d",NativeMaterial.primary);button.iconGravity=com.google.android.material.button.MaterialButton.ICON_GRAVITY_TEXT_END;button.iconTint=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)}
                val current=model.opt("folder").takeUnless {it==JSONObject.NULL};val selected=model.optBoolean("selecting") && id!=null && (model.optJSONArray("folders") ?: JSONArray()).let {folders->(0 until folders.length()).any {folders.getJSONObject(it).optString("id")==id && folders.getJSONObject(it).optBoolean("selected")}}
                val active=current==path || selected
                button.backgroundTintList=android.content.res.ColorStateList.valueOf(if(active)NativeMaterial.selected else Color.TRANSPARENT)
                button.strokeColor=android.content.res.ColorStateList.valueOf(if(active)NativeMaterial.primary else NativeMaterial.outline)
                button.setTextColor(if(active)NativeMaterial.primaryText else NativeMaterial.text);button.isSelected=active;if(current==path)activeTab=button
                button.setTypeface(button.typeface,if(active)Typeface.BOLD else Typeface.NORMAL)
                button.textSize=14f;button.minWidth=0;button.minimumWidth=0;button.minHeight=0;button.minimumHeight=0;button.insetTop=0;button.insetBottom=0
                button.setPadding(NativeMaterial.dp(context,12),0,NativeMaterial.dp(context,12),0)
                button.setOnClickListener {if(model.optBoolean("selecting") && id!=null)emit(activity,"file",mapOf("id" to id)) else emit(activity,"filter",mapOf("folder" to path,"query" to model.optString("query")))}
                if(id!=null)button.setOnLongClickListener {emit(activity,"file",mapOf("id" to id,"longPress" to true));true};tabs.addView(button,LinearLayout.LayoutParams(-2,NativeMaterial.dp(context,38)).apply {rightMargin=NativeMaterial.dp(context,10)})}
            tab(if(model.optBoolean("english"))"All" else "全部",null)
            val folders=model.optJSONArray("folders") ?: JSONArray();for(index in 0 until folders.length()){val folder=folders.getJSONObject(index);tab(folder.optString("name"),folder.optString("name"),folder.optBoolean("pinned"),folder.optString("id"))}
            tabScroll.post {val target=activeTab;if(filterChanged && target!=null)tabScroll.smoothScrollTo((target.left-(tabScroll.width-target.width)/2).coerceAtLeast(0),0) else tabScroll.scrollTo(left,0)}
            val first=list.firstVisiblePosition;val top=list.getChildAt(0)?.top ?: 0
            records=model.optJSONArray("items") ?: JSONArray();adapter.notifyDataSetChanged();list.setSelectionFromTop(if(filterChanged)0 else first,if(filterChanged)0 else top)
            footer.removeAllViews();frame.findViewWithTag<View>("create").visibility=if(model.optBoolean("selecting") || model.optBoolean("loading"))View.GONE else View.VISIBLE
            if(model.optBoolean("selecting")) {
                val controls=row(context);controls.addView(NativeMaterial.label(context,if(model.optBoolean("english"))"${model.optInt("count")} selected" else "${model.optInt("count")} 已选择"),LinearLayout.LayoutParams(0,-2,1f))
                for(action in listOf("all","cancel"))controls.addView(NativeMaterial.button(context,if(model.optBoolean("english"))if(action=="all")model.optString("selectAllLabel","Select all") else "Cancel" else if(action=="all")model.optString("selectAllLabel","全选") else "取消").apply {setOnClickListener {emit(activity,"home-action",mapOf("action" to action))}})
                footer.addView(controls)
                val actions=model.optJSONArray("actions") ?: JSONArray();val buttons=GridLayout(context).apply {columnCount=5}
                for(index in 0 until actions.length()){
                    val action=actions.getJSONObject(index);val id=action.optString("action")
                    buttons.addView(tile(context,id,action.optString("label"),!action.optBoolean("disabled")) {emit(activity,"home-action",mapOf("action" to id))},GridLayout.LayoutParams().apply {width=0;columnSpec=GridLayout.spec(GridLayout.UNDEFINED,1f);setMargins(2,2,2,2)})
                };footer.addView(buttons)
            }
        }
    }
    private fun boundWindow(activity:Activity,dialog:AlertDialog) {
        val host=activity.findViewById<View>(android.R.id.content)
        val height=if(host!=null && host.height>0)host.height else activity.resources.displayMetrics.heightPixels
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.window?.setLayout(-1,(height*.85f).toInt())
    }
    private fun settings(activity:Activity,model:JSONObject,position:Int):AlertDialog {
        val context=NativeMaterial.context(activity,dark);val content=vertical(context);padding(content,16)
        val dialog=NativeMaterial.dialog(context).setView(content).create()
        val header=row(context)
        header.addView(NativeMaterial.label(context,model.optString("title"),24f).apply {setTypeface(typeface,Typeface.BOLD)},LinearLayout.LayoutParams(0,-2,1f))
        header.addView(NativeMaterial.icon(context,"\ue5cd",model.optString("cancelLabel","取消")){emit(activity,"click",mapOf("key" to model.optString("cancel")))},LinearLayout.LayoutParams(NativeMaterial.dp(context,36),NativeMaterial.dp(context,36)))
        content.addView(header,LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,16)})
        val layout=vertical(context)
        renderNodes(activity,layout,model.optJSONArray("children") ?: JSONArray())
        // Header/footer reserve their space; only the body may shrink for IME/small screens.
        val scroll=ScrollView(context).apply {tag="settings-scroll";isFillViewport=false;addView(layout);post {scrollTo(0,position)}}
        content.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        val footer=row(context);footer.setPadding(0,NativeMaterial.dp(context,12),0,0)
        footer.addView(NativeMaterial.button(context,model.optString("cancelLabel","取消")).apply {setOnClickListener {emit(activity,"click",mapOf("key" to model.optString("cancel")))}},LinearLayout.LayoutParams(0,-1,1f).apply {rightMargin=NativeMaterial.dp(context,8)})
        footer.addView(NativeMaterial.button(context,model.optString("saveLabel","保存"),true).apply {setOnClickListener {emit(activity,"click",mapOf("key" to model.optString("save")))}},LinearLayout.LayoutParams(0,-1,1f))
        content.addView(footer,LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,60)))
        dialog.setCanceledOnTouchOutside(false);dialog.setCancelable(false)
        dialog.setOnShowListener {boundWindow(activity,dialog);NativeNavigation.dialogBack(dialog){emit(activity,"click",mapOf("key" to model.optString("cancel")))}}
        return dialog
    }
    private fun settingRow(context:Context,label:String,glyph:String="",action:()->Unit):LinearLayout {
        val line=row(context);line.minimumHeight=NativeMaterial.dp(context,52);padding(line,12)
        line.background=NativeMaterial.ripple(context,NativeMaterial.surface,12)
        if(glyph.isNotEmpty())line.addView(NativeMaterial.icon(context,glyph,label){}.apply {isClickable=false;isFocusable=false;textSize=20f;setTextColor(NativeMaterial.primary)},LinearLayout.LayoutParams(NativeMaterial.dp(context,24),NativeMaterial.dp(context,24)).apply {rightMargin=NativeMaterial.dp(context,12)})
        line.addView(NativeMaterial.label(context,label,15f),LinearLayout.LayoutParams(0,-2,1f))
        line.addView(NativeMaterial.icon(context,"\ue5cc",label){}.apply {isClickable=false;isFocusable=false;textSize=18f;setTextColor(NativeMaterial.muted)},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
        line.isFocusable=true;line.setOnClickListener {action()};return line
    }
    private fun renderNodes(activity:Activity,parent:LinearLayout,nodes:JSONArray,path:String="") {
        val context=parent.context
        for(index in 0 until nodes.length()) {
            val node=nodes.getJSONObject(index);val key=node.optString("key");val label=node.optString("label")
            when(node.optString("type")) {
                "container" -> renderNodes(activity,parent,node.optJSONArray("children") ?: JSONArray(),path)
                "text" -> parent.addView(NativeMaterial.label(context,label,if(node.has("size"))node.optDouble("size",14.0).toFloat() else if(node.optBoolean("heading"))18f else 14f).apply {if(key.isNotEmpty())tag=key;setTextIsSelectable(node.optBoolean("selectable"));setPadding(0,NativeMaterial.dp(context,8),0,NativeMaterial.dp(context,8));if(node.optBoolean("heading"))setTypeface(typeface,Typeface.BOLD)})
                "section" -> {
                    val section=vertical(context);padding(section,16);section.background=NativeMaterial.background(context,NativeMaterial.container,16,true)
                    section.addView(NativeMaterial.label(context,label,17f).apply {setTypeface(typeface,Typeface.BOLD)},LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,12)})
                    renderNodes(activity,section,node.optJSONArray("children") ?: JSONArray(),path+"/"+node.optString("key",label))
                    parent.addView(section,LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,14)})
                }
                "group" -> {
                    val groupId=path+"/"+node.optString("key",label)
                    val opened=groups[groupId] ?: node.optBoolean("expanded")
                    val box=vertical(context)
                    val children=vertical(context).apply {padding(this,12);visibility=if(opened)View.VISIBLE else View.GONE};var built=opened
                    if(opened)renderNodes(activity,children,node.optJSONArray("children") ?: JSONArray(),groupId)
                    val summary=settingRow(context,label) {
                        if(!built){renderNodes(activity,children,node.optJSONArray("children") ?: JSONArray(),groupId);built=true}
                        val show=children.visibility!=View.VISIBLE;groups[groupId]=show;children.visibility=if(show)View.VISIBLE else View.GONE
                        (box.getChildAt(0) as LinearLayout).getChildAt(1).rotation=if(show)90f else 0f
                    }
                    summary.getChildAt(1).rotation=if(opened)90f else 0f
                    box.addView(summary);box.addView(children);parent.addView(box,LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,8)})
                }
                "button" -> {
                    val enabled=!node.optBoolean("disabled")
                    val action={if(enabled)emit(activity,"click",mapOf("key" to key))}
                    val button:View=if(node.optBoolean("primary"))NativeMaterial.button(context,label,true).apply {setOnClickListener {action()}}
                        else settingRow(context,label,NativeMaterial.glyph(node.optString("id",key)),action).apply {if(node.optBoolean("active"))background=NativeMaterial.ripple(context,NativeMaterial.selected,12)}
                    button.isEnabled=enabled;button.alpha=if(enabled)1f else .45f
                    parent.addView(button,LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,8)})
                }
                "radio" -> parent.addView(com.google.android.material.radiobutton.MaterialRadioButton(context).apply {
                    text=label;setTextColor(NativeMaterial.text);buttonTintList=android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(NativeMaterial.primary,NativeMaterial.muted));isChecked=node.optBoolean("checked");isEnabled=!node.optBoolean("disabled")
                    setOnCheckedChangeListener {_,checked->if(checked)emit(activity,"change",mapOf("key" to key,"checked" to true))}
                })
                "checkbox" -> parent.addView(MaterialCheckBox(context).apply {
                    text=label;setTextColor(NativeMaterial.text);buttonTintList=android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(NativeMaterial.primary,NativeMaterial.muted));isChecked=node.optBoolean("checked");isEnabled=!node.optBoolean("disabled")
                    setOnCheckedChangeListener {_,checked->emit(activity,"change",mapOf("key" to key,"checked" to checked))}
                })
                "select" -> {
                    parent.addView(NativeMaterial.label(context,label));val options=node.optJSONArray("options") ?: JSONArray()
                    val entries=(0 until options.length()).map {options.getJSONObject(it)}
                    val selector=NativeMaterial.button(context,entries.find {it.optString("value")==node.optString("value")}?.optString("label") ?: "")
                    selector.isEnabled=!node.optBoolean("disabled");selector.setOnClickListener {
                        NativeMaterial.dialog(context).setTitle(label).setItems(entries.map {it.optString("label")}.toTypedArray()) {_,which->emit(activity,"change",mapOf("key" to key,"value" to entries[which].optString("value")))}.show()
                    };parent.addView(selector)
                }
                "input" -> {
                    if(node.optString("inputType")=="range") {
                        parent.addView(NativeMaterial.label(context,label))
                        val from=node.optString("min").toFloatOrNull() ?: 0f;val to=node.optString("max").toFloatOrNull()?.coerceAtLeast(from+1f) ?: 100f
                        val slider=com.google.android.material.slider.Slider(context).apply {
                            valueFrom=from;valueTo=to;value=(node.optString("value").toFloatOrNull() ?: from).coerceIn(from,to);isEnabled=!node.optBoolean("disabled")
                            thumbTintList=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)
                            trackActiveTintList=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)
                            addOnChangeListener {_,value,user->if(user)emit(activity,"input",mapOf("key" to key,"value" to value.toString()))}
                        };parent.addView(slider);continue
                    }
                    val input=NativeMaterial.field(parent,node.optString("value"),label,node.optString("inputType")=="textarea")
                    input.tag=key
                    input.isEnabled=!node.optBoolean("disabled");input.isFocusable=!node.optBoolean("readonly");input.isFocusableInTouchMode=!node.optBoolean("readonly")
                    if(node.optInt("maxLength",-1)>0)input.filters=arrayOf(android.text.InputFilter.LengthFilter(node.optInt("maxLength")))
                    if(node.optString("inputType") in listOf("number","range"))input.inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                    if(node.optString("inputType")=="password") {
                        input.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD;input.isSaveEnabled=false
                        if(android.os.Build.VERSION.SDK_INT>=26)input.importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
                    }
                    input.addTextChangedListener(object:TextWatcher {
                        override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                        override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){emit(activity,"input",mapOf("key" to key,"value" to s.toString()))}
                        override fun afterTextChanged(s:Editable?){}
                    })
                }
            }
        }
    }
    private fun tile(context:Context,id:String,label:String,enabled:Boolean,action:()->Unit):View {
        val box=vertical(context);padding(box,6);box.isEnabled=enabled;box.alpha=if(enabled)1f else .45f
        box.background=NativeMaterial.ripple(context,NativeMaterial.container,14)
        val icon=NativeMaterial.icon(context,NativeMaterial.glyph(id),label){if(enabled)action()}
        if(id=="delete")icon.setTextColor(NativeMaterial.danger)
        box.addView(icon,LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,32)))
        box.addView(NativeMaterial.label(context,label,12f).apply {gravity=Gravity.CENTER;maxLines=2},LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,32)))
        box.setOnClickListener {if(enabled)action()};return box
    }
    private fun menu(activity:Activity,model:JSONObject):AlertDialog {
        val context=NativeMaterial.context(activity,dark)
        val content=vertical(context);padding(content,16)
        val header=row(context)
        header.addView(NativeMaterial.label(context,model.optString("title"),20f).apply {setTypeface(typeface,Typeface.BOLD)},LinearLayout.LayoutParams(0,-2,1f))
        content.addView(header)
        val body=vertical(context);val scroll=ScrollView(context).apply {addView(body)};content.addView(scroll)
        val dialog=NativeMaterial.dialog(context).setView(content).create()
        header.addView(NativeMaterial.icon(context,"\ue5cd","关闭"){dialog.dismiss()})
        val items=model.optJSONArray("items") ?: JSONArray()
        var previous="";var grid:GridLayout?=null
        for(index in 0 until items.length()) {
            val item=items.getJSONObject(index);val group=item.optString("group")
            if(grid==null || group!=previous) {
                if(group.isNotBlank())body.addView(NativeMaterial.label(context,group,13f).apply {setTextColor(NativeMaterial.muted);setPadding(0,NativeMaterial.dp(context,14),0,NativeMaterial.dp(context,8))})
                grid=GridLayout(context).apply {columnCount=2};body.addView(grid);previous=group
            }
            val line=row(context);padding(line,10);line.minimumHeight=NativeMaterial.dp(context,48)
            val enabled=!item.optBoolean("disabled");line.alpha=if(enabled)1f else .45f
            line.background=NativeMaterial.ripple(context,if(item.optString("id")=="mobileMenuAIBtn")NativeMaterial.selected else Color.TRANSPARENT,12)
            line.addView(NativeMaterial.icon(context,NativeMaterial.glyph(item.optString("id")),item.optString("label")){}.apply {isClickable=false;isFocusable=false;textSize=18f;setTextColor(NativeMaterial.muted)},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)).apply {rightMargin=NativeMaterial.dp(context,10)})
            line.addView(NativeMaterial.label(context,item.optString("label"),13f),LinearLayout.LayoutParams(0,-2,1f))
            line.setOnClickListener {if(enabled){dialog.dismiss();emit(activity,"click",mapOf("key" to item.optString("key")))}}
            grid!!.addView(line,GridLayout.LayoutParams().apply {width=0;columnSpec=GridLayout.spec(GridLayout.UNDEFINED,1f);setMargins(3,3,3,3)})
        }
        dialog.setOnDismissListener {emit(activity,"close-more")};return dialog
    }
}
